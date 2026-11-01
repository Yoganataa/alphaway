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
  const { Database } = require("bun:sqlite");
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

  // Do not replace a live database. SQLite will also fail safely when source
  // and destination are the same path.
  if (path.resolve(backupPath) === path.resolve(databasePath)) {
    throw new Error("Backup path and destination database path must differ");
  }

  const stagedPath = `${databasePath}.restore-${randomUUID()}.tmp`;
  try {
    fs.copyFileSync(backupPath, stagedPath);
    if (process.platform !== "win32") fs.chmodSync(stagedPath, 0o600);
    fs.renameSync(stagedPath, databasePath);
  } catch (error) {
    try { fs.rmSync(stagedPath, { force: true }); } catch {}
    throw error;
  }
}
