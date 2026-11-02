#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { createMigrationBackup, restoreDatabaseBackup } from "../core/migrations/backup";
import { closeDatabase, getDatabase, getDbFilePath } from "../core/database";
import { acquireAlphaWayProcessLock } from "../core/process-lock";

function usage(): never {
  console.error(`Usage:
  bun src/cli/database.ts backup
  bun src/cli/database.ts restore <encrypted-backup.sqlite.awenc> [database-path]

The restore command requires the AlphaWay service to be stopped first.
The backup must be an encrypted AlphaWay SQLite snapshot (.awenc).`);
  process.exit(2);
}

function acquireRestoreLock(databasePath: string): () => void {
  // Lock both the configured data root and the actual restore destination.
  // This remains safe when DB_PATH points outside DATA_DIR or a restore target
  // differs from the database currently configured for this CLI process.
  return acquireAlphaWayProcessLock(databasePath);
}

const [command, ...args] = process.argv.slice(2).filter((argument) => argument !== "--");

if (command === "backup") {
  const db = getDatabase();
  try {
    const backupPath = createMigrationBackup(db, getDbFilePath(), "operator-manual");
    console.log(backupPath);
  } finally {
    closeDatabase();
  }
} else if (command === "restore") {
  const backupPath = args[0] ? path.resolve(args[0]) : "";
  const databasePath = args[1] ? path.resolve(args[1]) : getDbFilePath();
  if (!backupPath || !backupPath.endsWith(".awenc") || !fs.existsSync(backupPath) || databasePath === ":memory:") usage();
  let releaseLock: (() => void) | undefined;
  try {
    releaseLock = acquireRestoreLock(databasePath);
    restoreDatabaseBackup(backupPath, databasePath);
    console.log(`SQLite database restored from ${backupPath} to ${databasePath}`);
  } catch (error) {
    console.error("SQLite database restore failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    releaseLock?.();
  }
} else {
  usage();
}
