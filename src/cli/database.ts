#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { createMigrationBackup, restoreDatabaseBackup } from "../core/migrations/backup";
import { closeDatabase, getDatabase, getDbFilePath } from "../core/database";
import { resolveDataDir } from "../core/storage-paths";

function usage(): never {
  console.error(`Usage:
  bun src/cli/database.ts backup
  bun src/cli/database.ts restore <encrypted-backup.sqlite.awenc> [database-path]

The restore command requires the AlphaWay service to be stopped first.
The backup must be an encrypted AlphaWay SQLite snapshot (.awenc).`);
  process.exit(2);
}

function assertNoManagedDaemon(): void {
  const pidFile = path.join(resolveDataDir(), "alphaway.pid");
  if (!fs.existsSync(pidFile)) return;
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  try {
    process.kill(pid, 0);
    throw new Error(`AlphaWay daemon PID ${pid} appears to be running. Stop it before restoring a database.`);
  } catch (error: any) {
    if (error?.code === "EPERM") {
      throw new Error(`AlphaWay daemon PID ${pid} appears to be running. Stop it before restoring a database.`);
    }
    if (error?.code !== "ESRCH") throw error;
  }
}

const [command, ...args] = process.argv.slice(2);

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
  assertNoManagedDaemon();
  try {
    restoreDatabaseBackup(backupPath, databasePath);
    console.log(`SQLite database restored from ${backupPath} to ${databasePath}`);
  } catch (error) {
    console.error("SQLite database restore failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else {
  usage();
}
