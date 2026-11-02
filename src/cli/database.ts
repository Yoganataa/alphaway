#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { createMigrationBackup, restoreDatabaseBackup } from "../core/migrations/backup";
import { closeDatabase, getDatabase, getDbFilePath } from "../core/database";
import { resolveDataDir } from "../core/storage-paths";
import { acquireAlphaWayProcessLock } from "../core/process-lock";

function usage(): never {
  console.error(`Usage:
  bun src/cli/database.ts backup
  bun src/cli/database.ts restore <encrypted-backup.sqlite.awenc> [database-path]

The restore command requires the AlphaWay service to be stopped first.
The backup must be an encrypted AlphaWay SQLite snapshot (.awenc).`);
  process.exit(2);
}

function acquireRestoreLock(): () => void {
  // This is the same atomic lock held by every AlphaWay server process. It
  // fails closed for foreground and service-manager launches as well as daemon
  // mode, and prevents a new server from starting during the restore window.
  return acquireAlphaWayProcessLock();
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
  if (!backupPath || !backupPath.endsWith(".awenc") || !fs.existsSync(backupPath)) usage();
  let releaseLock: (() => void) | undefined;
  try {
    releaseLock = acquireRestoreLock();
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
