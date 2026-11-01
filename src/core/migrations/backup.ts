import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "../secrets";

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readRegularFile(filePath: string): { bytes: Buffer; stat: fs.Stats } {
  const pathStat = fs.lstatSync(filePath);
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) throw new Error("Database backup must be a regular, non-symlink file");
  const noFollow = process.platform === "win32" ? 0 : (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.dev !== pathStat.dev || stat.ino !== pathStat.ino) throw new Error("Database backup changed while it was being opened");
    if (process.platform !== "win32") fs.fchmodSync(fd, 0o600);
    return { bytes: fs.readFileSync(fd), stat };
  } finally {
    fs.closeSync(fd);
  }
}

function writeExclusive(filePath: string, data: string | Buffer): void {
  const fd = fs.openSync(filePath, "wx", 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function encryptPlainDatabaseBackup(plainPath: string, expectedBytes?: Buffer): string {
  const read = readRegularFile(plainPath);
  if (expectedBytes && sha256(read.bytes) !== sha256(expectedBytes)) throw new Error("Database backup changed before encryption");
  const encryptedPath = plainPath.endsWith(".sqlite") ? plainPath + ".awenc" : plainPath.replace(/\.plain\.tmp$/, ".sqlite.awenc");
  const tempPath = encryptedPath + "." + randomUUID() + ".tmp";
  try {
    writeExclusive(tempPath, encryptSecret(read.bytes.toString("base64")));
    const latest = readRegularFile(plainPath);
    if (latest.stat.dev !== read.stat.dev || latest.stat.ino !== read.stat.ino || sha256(latest.bytes) !== sha256(read.bytes)) {
      throw new Error("Database backup changed while encryption was in progress");
    }
    fs.renameSync(tempPath, encryptedPath);
    fs.unlinkSync(plainPath);
    return encryptedPath;
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

/** Encrypt pre-Phase-2 plaintext migration backups when the database is opened. */
export function encryptExistingMigrationBackups(backupDir: string): string[] {
  if (!fs.existsSync(backupDir)) return [];
  const directoryStat = fs.lstatSync(backupDir);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) throw new Error("Migration backup directory must be a regular directory");
  if (process.platform !== "win32") fs.chmodSync(backupDir, 0o700);
  const encrypted: string[] = [];
  for (const name of fs.readdirSync(backupDir)) {
    if (!/^alphaway-before-.+\.sqlite$/i.test(name)) continue;
    const source = path.join(backupDir, name);
    const target = source + ".awenc";
    if (fs.existsSync(target)) {
      const encryptedFile = readRegularFile(target).bytes.toString("utf8").trim();
      if (!isEncryptedSecret(encryptedFile)) throw new Error("Existing encrypted migration backup is invalid");
      const decoded = Buffer.from(decryptSecret(encryptedFile), "base64");
      const legacy = readRegularFile(source);
      if (sha256(decoded) !== sha256(legacy.bytes)) throw new Error("Existing encrypted migration backup does not match its plaintext source");
      fs.unlinkSync(source);
      encrypted.push(target);
      continue;
    }
    encrypted.push(encryptPlainDatabaseBackup(source));
  }
  return encrypted;
}

/** Create an AES-256-GCM encrypted SQLite snapshot before a destructive migration. */
export function createMigrationBackup(db: any, databasePath: string, migrationName: string): string {
  if (databasePath === ":memory:") throw new Error("Cannot run a destructive migration against an in-memory database without an explicit backup");
  const backupDir = path.join(path.dirname(databasePath), "backups");
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(backupDir, 0o700);
  encryptExistingMigrationBackups(backupDir);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = migrationName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "migration";
  const unique = randomUUID().slice(0, 8);
  const backupPath = path.join(backupDir, "alphaway-before-" + safeName + "-" + stamp + "-" + unique + ".sqlite.awenc");
  const plainPath = path.join(backupDir, ".alphaway-before-" + safeName + "-" + stamp + "-" + unique + ".plain.tmp");
  try {
    db.exec("PRAGMA wal_checkpoint(FULL)");
    const escapedPath = plainPath.replace(/\x27/g, "\x27\x27");
    db.exec("VACUUM INTO '" + escapedPath + "'");
    const stat = fs.statSync(plainPath);
    if (!stat.isFile() || stat.size === 0) throw new Error("SQLite VACUUM INTO did not produce a readable backup file");
    if (process.platform !== "win32") fs.chmodSync(plainPath, 0o600);
    const plain = readRegularFile(plainPath).bytes;
    const tempPath = backupPath + "." + randomUUID() + ".tmp";
    try { writeExclusive(tempPath, encryptSecret(plain.toString("base64"))); fs.renameSync(tempPath, backupPath); }
    finally { try { fs.unlinkSync(tempPath); } catch {} }
    return backupPath;
  } finally { try { fs.unlinkSync(plainPath); } catch {} }
}

/** Restore a legacy plaintext or encrypted SQLite backup. Stop AlphaWay before replacing its database. */
export function restoreDatabaseBackup(backupPath: string, databasePath: string): void {
  if (path.resolve(backupPath) === path.resolve(databasePath)) throw new Error("Backup path and destination database path must differ");
  const source = readRegularFile(backupPath);
  const storedText = source.bytes.toString("utf8").trim();
  let sqliteBytes: Buffer;
  if (isEncryptedSecret(storedText)) {
    const encoded = decryptSecret(storedText);
    sqliteBytes = Buffer.from(encoded, "base64");
    if (!sqliteBytes.length || sqliteBytes.toString("base64") !== encoded) throw new Error("Encrypted database backup does not contain valid base64 SQLite data");
  } else {
    // Older plaintext backups remain restorable; convert them to an encrypted sibling first.
    encryptPlainDatabaseBackup(backupPath, source.bytes);
    sqliteBytes = source.bytes;
  }

  const restoreDir = path.dirname(databasePath);
  fs.mkdirSync(restoreDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(restoreDir, 0o700);
  const unique = randomUUID();
  const stagedPath = databasePath + ".restore-" + unique + ".tmp";
  const previousPath = databasePath + ".pre-restore-" + unique + ".tmp";
  let previousMoved = false;
  try {
    writeExclusive(stagedPath, sqliteBytes);
    const validation = new Database(stagedPath, { readonly: true });
    try {
      const result = validation.query("PRAGMA quick_check").get();
      const value = result?.quick_check ?? result?.["quick_check"];
      if (value !== "ok") throw new Error("SQLite backup integrity check failed: " + String(value));
    } finally { validation.close(); }

    if (fs.existsSync(databasePath)) {
      const current = new Database(databasePath);
      try {
        current.exec("PRAGMA wal_checkpoint(FULL)");
        createMigrationBackup(current, databasePath, "pre-restore");
      } finally { current.close(); }
      fs.renameSync(databasePath, previousPath);
      previousMoved = true;
    }
    fs.rmSync(databasePath + "-wal", { force: true });
    fs.rmSync(databasePath + "-shm", { force: true });
    fs.renameSync(stagedPath, databasePath);
    if (process.platform !== "win32") fs.chmodSync(databasePath, 0o600);
    if (previousMoved) fs.rmSync(previousPath, { force: true });
  } catch (error) {
    try { fs.rmSync(stagedPath, { force: true }); } catch {}
    if (previousMoved && !fs.existsSync(databasePath)) { try { fs.renameSync(previousPath, databasePath); } catch {} }
    throw error;
  }
}