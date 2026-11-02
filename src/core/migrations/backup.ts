import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { getSecretEncryptionKeyForBackup, isEncryptedSecret } from "../secrets";

const FILE_CHUNK_BYTES = 96 * 1024; // divisible by three for stable base64 chunk boundaries
const BACKUP_PREFIX_V1 = "awenc:v1:";
const BACKUP_PREFIX_V2 = "awenc:v2:";

function sameFileSnapshot(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs;
}

function writeAll(fd: number, data: Buffer | string): void {
  const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  let offset = 0;
  while (offset < buffer.length) {
    offset += fs.writeSync(fd, buffer, offset, buffer.length - offset);
  }
}

function readAtMost(fd: number, position: number, maxBytes: number): Buffer {
  const buffer = Buffer.allocUnsafe(maxBytes);
  let total = 0;
  while (total < maxBytes) {
    const count = fs.readSync(fd, buffer, total, maxBytes - total, position + total);
    if (count === 0) break;
    total += count;
  }
  return buffer.subarray(0, total);
}

function openRegularFile(filePath: string): { fd: number; stat: fs.Stats } {
  const pathStat = fs.lstatSync(filePath);
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
    throw new Error("Database backup must be a regular, non-symlink file");
  }
  const noFollow = process.platform === "win32" ? 0 : (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== pathStat.dev || opened.ino !== pathStat.ino) {
      throw new Error("Database backup changed while it was being opened");
    }
    if (process.platform !== "win32") fs.fchmodSync(fd, 0o600);
    return { fd, stat: fs.fstatSync(fd) };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

/**
 * Encrypt a SQLite file using bounded synchronous file I/O. The plaintext fed
 * to AES-GCM is the same base64 representation used by the v1 secret envelope,
 * so legacy callers can continue to decrypt it with decryptSecret().
 */
function encryptDatabaseBackupFile(plainPath: string, outputPath: string): void {
  const source = openRegularFile(plainPath);
  const cipherPath = outputPath + "." + randomUUID() + ".cipher.tmp";
  let cipherFd: number | undefined;
  let outputFd: number | undefined;
  let success = false;

  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getSecretEncryptionKeyForBackup(), iv);
    cipherFd = fs.openSync(cipherPath, "wx", 0o600);

    let position = 0;
    let plaintextCarry = Buffer.alloc(0);
    while (true) {
      const chunk = readAtMost(source.fd, position, FILE_CHUNK_BYTES);
      if (chunk.length === 0) break;
      position += chunk.length;
      const combined = plaintextCarry.length ? Buffer.concat([plaintextCarry, chunk]) : chunk;
      const isFinalChunk = chunk.length < FILE_CHUNK_BYTES;
      const processLength = isFinalChunk
        ? combined.length
        : combined.length - (combined.length % 3);
      if (processLength > 0) {
        writeAll(cipherFd, cipher.update(combined.subarray(0, processLength).toString("base64")));
      }
      plaintextCarry = Buffer.from(combined.subarray(processLength));
      if (isFinalChunk) break;
    }
    if (plaintextCarry.length) writeAll(cipherFd, cipher.update(plaintextCarry.toString("base64")));
    writeAll(cipherFd, cipher.final());
    fs.fsyncSync(cipherFd);
    fs.closeSync(cipherFd);
    cipherFd = undefined;

    const afterRead = fs.fstatSync(source.fd);
    if (!sameFileSnapshot(source.stat, afterRead)) {
      throw new Error("Database backup changed while encryption was in progress");
    }

    const tag = cipher.getAuthTag();
    outputFd = fs.openSync(outputPath, "wx", 0o600);
    writeAll(outputFd, BACKUP_PREFIX_V2 + iv.toString("base64url") + "." + tag.toString("base64url") + ".");

    const encryptedFile = openRegularFile(cipherPath);
    try {
      let encryptedPosition = 0;
      while (true) {
        const chunk = readAtMost(encryptedFile.fd, encryptedPosition, FILE_CHUNK_BYTES);
        if (chunk.length === 0) break;
        encryptedPosition += chunk.length;
        writeAll(outputFd, chunk.toString("base64url"));
        if (chunk.length < FILE_CHUNK_BYTES) break;
      }
      if (!sameFileSnapshot(encryptedFile.stat, fs.fstatSync(encryptedFile.fd))) {
        throw new Error("Temporary encrypted database backup changed while being encoded");
      }
    } finally {
      fs.closeSync(encryptedFile.fd);
    }

    fs.fsyncSync(outputFd);
    fs.closeSync(outputFd);
    outputFd = undefined;
    if (process.platform !== "win32") fs.chmodSync(outputPath, 0o600);
    success = true;
  } finally {
    fs.closeSync(source.fd);
    if (cipherFd !== undefined) fs.closeSync(cipherFd);
    if (outputFd !== undefined) fs.closeSync(outputFd);
    try { fs.unlinkSync(cipherPath); } catch {}
    if (!success) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }
}

/** Decrypt either the legacy v1 envelope or the streaming v2 envelope to a file. */
function decryptDatabaseBackupFile(encryptedPath: string, outputPath: string): void {
  const source = openRegularFile(encryptedPath);
  let outputFd: number | undefined;
  let success = false;

  try {
    const header = readAtMost(source.fd, 0, 128).toString("ascii");
    const prefix = header.startsWith(BACKUP_PREFIX_V2)
      ? BACKUP_PREFIX_V2
      : header.startsWith(BACKUP_PREFIX_V1)
        ? BACKUP_PREFIX_V1
        : "";
    if (!prefix) throw new Error("File is not a supported encrypted AlphaWay database backup");

    const ivStart = prefix.length;
    const ivEnd = header.indexOf(".", ivStart);
    const tagEnd = ivEnd >= 0 ? header.indexOf(".", ivEnd + 1) : -1;
    if (ivEnd < 0 || tagEnd < 0) throw new Error("Encrypted database backup header is malformed");
    const ivText = header.slice(ivStart, ivEnd);
    const tagText = header.slice(ivEnd + 1, tagEnd);
    if (!/^[A-Za-z0-9_-]+$/.test(ivText) || !/^[A-Za-z0-9_-]+$/.test(tagText)) {
      throw new Error("Encrypted database backup header is malformed");
    }
    const iv = Buffer.from(ivText, "base64url");
    const tag = Buffer.from(tagText, "base64url");
    if (iv.length !== 12 || tag.length !== 16 ||
        iv.toString("base64url") !== ivText || tag.toString("base64url") !== tagText) {
      throw new Error("Encrypted database backup header is invalid");
    }

    const decipher = createDecipheriv("aes-256-gcm", getSecretEncryptionKeyForBackup(), iv);
    decipher.setAuthTag(tag);
    outputFd = fs.openSync(outputPath, "wx", 0o600);

    let ciphertextPosition = tagEnd + 1;
    let ciphertextCarry = "";
    let plaintextBase64Carry = "";

    const consumePlaintextBase64 = (bytes: Buffer, final = false) => {
      const text = plaintextBase64Carry + bytes.toString("ascii");
      if (!/^[A-Za-z0-9+/=]*$/.test(text)) {
        throw new Error("Encrypted database backup plaintext encoding is malformed");
      }
      const processLength = final
        ? text.length
        : Math.max(0, Math.floor((text.length - 4) / 4) * 4);
      const encoded = text.slice(0, processLength);
      if (encoded.length) {
        const decoded = Buffer.from(encoded, "base64");
        if (decoded.toString("base64") !== encoded) {
          throw new Error("Encrypted database backup plaintext encoding is invalid");
        }
        writeAll(outputFd!, decoded);
      }
      plaintextBase64Carry = text.slice(processLength);
      if (final && plaintextBase64Carry.length !== 0) {
        throw new Error("Encrypted database backup plaintext has an invalid base64 length");
      }
    };

    const consumeCiphertextBase64url = (text: string) => {
      if (!/^[A-Za-z0-9_-]*$/.test(text)) {
        throw new Error("Encrypted database backup ciphertext encoding is malformed");
      }
      const combined = ciphertextCarry + text;
      const processLength = combined.length - (combined.length % 4);
      const encoded = combined.slice(0, processLength);
      if (encoded.length) {
        const decoded = Buffer.from(encoded, "base64url");
        if (decoded.toString("base64url") !== encoded) {
          throw new Error("Encrypted database backup ciphertext encoding is invalid");
        }
        consumePlaintextBase64(decipher.update(decoded));
      }
      ciphertextCarry = combined.slice(processLength);
    };

    while (ciphertextPosition < source.stat.size) {
      const chunk = readAtMost(
        source.fd,
        ciphertextPosition,
        Math.min(FILE_CHUNK_BYTES, source.stat.size - ciphertextPosition)
      );
      if (chunk.length === 0) break;
      ciphertextPosition += chunk.length;
      consumeCiphertextBase64(chunk.toString("ascii"));
    }

    if (ciphertextCarry.length === 1) {
      throw new Error("Encrypted database backup ciphertext has an invalid base64url length");
    }
    if (ciphertextCarry.length) {
      const decoded = Buffer.from(ciphertextCarry, "base64url");
      if (decoded.toString("base64url") !== ciphertextCarry) {
        throw new Error("Encrypted database backup ciphertext encoding is invalid");
      }
      consumePlaintextBase64(decipher.update(decoded));
    }
    consumePlaintextBase64(decipher.final(), true);

    if (!sameFileSnapshot(source.stat, fs.fstatSync(source.fd))) {
      throw new Error("Encrypted database backup changed while it was being restored");
    }
    fs.fsyncSync(outputFd);
    fs.closeSync(outputFd);
    outputFd = undefined;
    if (process.platform !== "win32") fs.chmodSync(outputPath, 0o600);
    success = true;
  } finally {
    fs.closeSync(source.fd);
    if (outputFd !== undefined) fs.closeSync(outputFd);
    if (!success) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }
}

function fileSha256(filePath: string): string {
  const source = openRegularFile(filePath);
  const hash = createHash("sha256");
  try {
    let position = 0;
    while (position < source.stat.size) {
      const chunk = readAtMost(source.fd, position, Math.min(FILE_CHUNK_BYTES, source.stat.size - position));
      if (chunk.length === 0) break;
      position += chunk.length;
      hash.update(chunk);
    }
    if (!sameFileSnapshot(source.stat, fs.fstatSync(source.fd))) {
      throw new Error("Database backup changed while its checksum was being calculated");
    }
    return hash.digest("hex");
  } finally {
    fs.closeSync(source.fd);
  }
}

function readBackupPrefix(filePath: string): string {
  const source = openRegularFile(filePath);
  try {
    const prefix = readAtMost(source.fd, 0, Math.min(16, source.stat.size)).toString("ascii");
    if (!sameFileSnapshot(source.stat, fs.fstatSync(source.fd))) {
      throw new Error("Database backup changed while its format was being checked");
    }
    return prefix;
  } finally {
    fs.closeSync(source.fd);
  }
}

function encryptPlainDatabaseBackup(plainPath: string): string {
  const encryptedPath = plainPath + ".awenc";
  const tempPath = encryptedPath + "." + randomUUID() + ".tmp";
  try {
    encryptDatabaseBackupFile(plainPath, tempPath);
    fs.renameSync(tempPath, encryptedPath);
    fs.unlinkSync(plainPath);
    return encryptedPath;
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

/** Encrypt pre-Phase-2 plaintext migration backups when the database is opened. */
export function encryptExistingMigrationBackups(backupDir: string, legacyDatabaseName?: string): string[] {
  if (!fs.existsSync(backupDir)) return [];
  const directoryStat = fs.lstatSync(backupDir);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error("Migration backup directory must be a regular directory");
  }
  if (process.platform !== "win32") fs.chmodSync(backupDir, 0o700);
  const encrypted: string[] = [];
  for (const name of fs.readdirSync(backupDir)) {
    const legacyMigration = /^alphaway-before-.+\.sqlite$/i.test(name);
    const legacyRestore = Boolean(
      legacyDatabaseName &&
      name.startsWith(legacyDatabaseName + ".pre-restore-") &&
      (name.endsWith(".sqlite") || name.endsWith(".tmp"))
    );
    if (!legacyMigration && !legacyRestore) continue;

    const source = path.join(backupDir, name);
    const target = source + ".awenc";
    if (fs.existsSync(target)) {
      const verifyPath = source + "." + randomUUID() + ".verify.tmp";
      try {
        decryptDatabaseBackupFile(target, verifyPath);
        if (fileSha256(verifyPath) !== fileSha256(source)) {
          throw new Error("Existing encrypted migration backup does not match its plaintext source");
        }
      } finally {
        try { fs.unlinkSync(verifyPath); } catch {}
      }
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
  if (databasePath === ":memory:") {
    throw new Error("Cannot run a destructive migration against an in-memory database without an explicit backup");
  }
  const backupDir = path.join(path.dirname(databasePath), "backups");
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(backupDir, 0o700);
  encryptExistingMigrationBackups(backupDir);
  encryptExistingMigrationBackups(path.dirname(databasePath), path.basename(databasePath));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = migrationName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "migration";
  const unique = randomUUID().slice(0, 8);
  const backupPath = path.join(backupDir, "alphaway-before-" + safeName + "-" + stamp + "-" + unique + ".sqlite.awenc");
  const plainPath = path.join(backupDir, ".alphaway-before-" + safeName + "-" + stamp + "-" + unique + ".plain.tmp");
  const encryptedTempPath = backupPath + "." + randomUUID() + ".tmp";

  try {
    db.exec("PRAGMA wal_checkpoint(FULL)");
    const escapedPath = plainPath.replace(/\x27/g, "\x27\x27");
    db.exec("VACUUM INTO '" + escapedPath + "'");
    const stat = fs.statSync(plainPath);
    if (!stat.isFile() || stat.size === 0) {
      throw new Error("SQLite VACUUM INTO did not produce a readable backup file");
    }
    if (process.platform !== "win32") fs.chmodSync(plainPath, 0o600);
    encryptDatabaseBackupFile(plainPath, encryptedTempPath);
    fs.renameSync(encryptedTempPath, backupPath);
    return backupPath;
  } finally {
    try { fs.unlinkSync(plainPath); } catch {}
    try { fs.unlinkSync(encryptedTempPath); } catch {}
  }
}

/** Restore a legacy plaintext or encrypted SQLite backup. Stop AlphaWay before replacing its database. */
export function restoreDatabaseBackup(backupPath: string, databasePath: string): void {
  if (path.resolve(backupPath) === path.resolve(databasePath)) {
    throw new Error("Backup path and destination database path must differ");
  }

  const prefix = readBackupPrefix(backupPath);
  let encryptedSource = backupPath;
  if (!prefix.startsWith("awenc:")) {
    encryptedSource = encryptPlainDatabaseBackup(backupPath);
  } else if (!prefix.startsWith(BACKUP_PREFIX_V1) && !prefix.startsWith(BACKUP_PREFIX_V2)) {
    throw new Error("Database backup uses an unsupported encryption envelope version");
  } else if (!isEncryptedSecret(prefix)) {
    throw new Error("Database backup has an invalid encryption envelope");
  }

  const restoreDir = path.dirname(databasePath);
  fs.mkdirSync(restoreDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(restoreDir, 0o700);
  const unique = randomUUID();
  const stagedPath = databasePath + ".restore-" + unique + ".tmp";
  const previousPath = databasePath + ".pre-restore-" + unique + ".tmp";
  let previousMoved = false;

  try {
    decryptDatabaseBackupFile(encryptedSource, stagedPath);
    const validation = new Database(stagedPath, { readonly: true });
    try {
      const result = validation.query("PRAGMA quick_check").get();
      const value = result?.quick_check ?? result?.["quick_check"];
      if (value !== "ok") {
        throw new Error("SQLite backup integrity check failed: " + String(value));
      }
    } finally {
      validation.close();
    }

    if (fs.existsSync(databasePath)) {
      const current = new Database(databasePath);
      try {
        current.exec("PRAGMA wal_checkpoint(FULL)");
        createMigrationBackup(current, databasePath, "pre-restore");
      } finally {
        current.close();
      }
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
    if (previousMoved && !fs.existsSync(databasePath)) {
      try { fs.renameSync(previousPath, databasePath); } catch {}
    }
    throw error;
  }
}
