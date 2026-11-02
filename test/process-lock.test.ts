import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireAlphaWayProcessLock, getAlphaWayDatabaseLockPath } from "../src/core/process-lock";

const previousDataDir = process.env.DATA_DIR;
const previousDatabasePath = process.env.DB_PATH;
let temporaryDirectory = "";

function useTemporaryDataDir(): string {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-process-lock-"));
  process.env.DATA_DIR = temporaryDirectory;
  process.env.DB_PATH = path.join(temporaryDirectory, "db", "data.sqlite");
  return temporaryDirectory;
}

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  if (previousDatabasePath === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = previousDatabasePath;
  if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = "";
});

describe("AlphaWay process/data-directory lock", () => {
  it("allows only one server or restore process to hold the data directory", () => {
    const directory = useTemporaryDataDir();
    const lockPath = path.join(directory, "alphaway.lock");
    const release = acquireAlphaWayProcessLock();

    expect(fs.readFileSync(lockPath, "utf8").trim()).toBe(String(process.pid));
    expect(() => acquireAlphaWayProcessLock()).toThrow(/already holding the data-directory lock/);

    release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("locks the canonical database path across DATA_DIR roots and explicit restore destinations", () => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-shared-db-lock-"));
    const sharedDatabase = path.join(temporaryDirectory, "shared", "data.sqlite");
    const databaseLockPath = getAlphaWayDatabaseLockPath(sharedDatabase)!;

    process.env.DATA_DIR = path.join(temporaryDirectory, "service-state");
    process.env.DB_PATH = sharedDatabase;
    const releaseService = acquireAlphaWayProcessLock();
    expect(fs.existsSync(databaseLockPath)).toBe(true);

    // A restore process with a different DATA_DIR and different configured
    // DB_PATH must still collide with the server holding this destination DB.
    process.env.DATA_DIR = path.join(temporaryDirectory, "restore-state");
    process.env.DB_PATH = path.join(temporaryDirectory, "other-configured.sqlite");
    expect(() => acquireAlphaWayProcessLock(sharedDatabase)).toThrow(/database lock/);

    releaseService();
    expect(fs.existsSync(databaseLockPath)).toBe(false);

    const releaseRestore = acquireAlphaWayProcessLock(sharedDatabase);
    expect(fs.existsSync(databaseLockPath)).toBe(true);
    releaseRestore();
    expect(fs.existsSync(databaseLockPath)).toBe(false);
  });

  it("fails closed on a stale PID file instead of racing an automatic unlink", () => {
    const directory = useTemporaryDataDir();
    const lockPath = path.join(directory, "alphaway.lock");
    fs.writeFileSync(lockPath, "2147483647\n", { mode: 0o600 });

    expect(() => acquireAlphaWayProcessLock()).toThrow(/stale AlphaWay process lock/);
    expect(fs.readFileSync(lockPath, "utf8")).toBe("2147483647\n");
  });

  it("refuses a symlink at the process lock path", () => {
    if (process.platform === "win32") return;
    const directory = useTemporaryDataDir();
    const lockPath = path.join(directory, "alphaway.lock");
    const target = path.join(directory, "target");
    fs.writeFileSync(target, "2147483647\n");
    fs.symlinkSync(target, lockPath);

    expect(() => acquireAlphaWayProcessLock()).toThrow(/non-symlink file/);
    expect(fs.readFileSync(target, "utf8")).toBe("2147483647\n");
  });
});
