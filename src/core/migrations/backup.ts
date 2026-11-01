import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Migration } from "./types";

/**
 * Create a standalone, consistent SQLite backup before a destructive schema
 * migration. The database connection must remain open for VACUUM INTO.
 *
 * Backups are stored beside the source database in a private `backups`
 * directory. They are deliberately retained for operator-led recovery.
 */
export function createMigrationBackup(
  db: any,
  databasePath: string,
  migrationName: string
): string {
  if (databasePath === ":memory:") {
    throw new Error(
      "Cannot run a destructive migration against an in-memory database without an explicit backup"
    );
  }

  const backupDir = path.join(path.dirname(databasePath), "backups");
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(backupDir, 0o700);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = migrationName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "migration";
  const unique = randomUUID().slice(0, 8);
  const backupPath = path.join(
    backupDir,
    `alphaway-before-${safeName}-${stamp}-${unique}.sqlite`
  );

  // Flush WAL pages before creating a portable standalone database copy.
  db.exec("PRAGMA wal_checkpoint(FULL)");
  const escapedPath = backupPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedPath}'`);

  if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size === 0) {
    throw new Error("SQLite VACUUM INTO did not produce a readable backup file");
  }
  if (process.platform !== "win32") fs.chmodSync(backupPath, 0o600);
  return backupPath;
}

/**
 * Restore helper is intentionally not automatic in production. Operators
 * should stop AlphaWay before replacing the active database with a backup.
 */
export function restoreDatabaseBackup(
  backupPath: string,
  databasePath: string
): void {
  if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) {
    throw new Error(`Database backup not found: ${backupPath}`);
  }

  const restoreDir = path.dirname(databasePath);
  fs.mkdirSync(restoreDir, { recursive: true, mode: 0o700 });

  // Validate the backup before touching the destination.
  const validation = new Database(backupPath, { readonly: true });
  try {
    const result = validation.query("PRAGMA quick_check").get();
    const value = result?.quick_check ?? result?.["quick_check"];
    if (value !== "ok") {
      throw new Error(`SQLite backup integrity check failed: ${String(value)}`);
    }
  } finally {
    validation.close();
  }

  // Do not replace a live database. The caller must stop AlphaWay and close
  // every SQLite connection before invoking this function.
  if (path.resolve(backupPath) === path.resolve(databasePath)) {
    throw new Error("Backup path and destination database path must differ");
  }

  const unique = randomUUID();
  const stagedPath = `${databasePath}.restore-${unique}.tmp`;
  const previousPath = `${databasePath}.pre-restore-${unique}.sqlite`;
  let previousMoved = false;

  try {
    fs.copyFileSync(backupPath, stagedPath);
    if (process.platform !== "win32") fs.chmodSync(stagedPath, 0o600);

    if (fs.existsSync(databasePath)) {
      const current = new Database(databasePath);
      try {
        current.exec("PRAGMA wal_checkpoint(FULL)");
      } finally {
        current.close();
      }

      fs.renameSync(databasePath, previousPath);
      previousMoved = true;
    }

    // A stopped database may still have sidecars from the previous WAL mode.
    fs.rmSync(`${databasePath}-wal`, { force: true });
    fs.rmSync(`${databasePath}-shm`, { force: true });
    fs.renameSync(stagedPath, databasePath);

    if (process.platform !== "win32") fs.chmodSync(databasePath, 0o600);
  } catch (error) {
    try { fs.rmSync(stagedPath, { force: true }); } catch {}
    if (previousMoved && !fs.existsSync(databasePath)) {
      try { fs.renameSync(previousPath, databasePath); } catch {}
    }
    throw error;
  }
}
