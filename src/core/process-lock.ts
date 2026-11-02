import fs from "node:fs";
import path from "node:path";
import { ensurePrivateDirectory, resolveDataDir, resolveDatabasePath } from "./storage-paths";

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error?.code === "EPERM";
  }
}

function readLockPid(lockPath: string): number {
  const pathStat = fs.lstatSync(lockPath);
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
    throw new Error("AlphaWay process lock must be a regular, non-symlink file");
  }
  const noFollow = process.platform === "win32" ? 0 : (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(lockPath, fs.constants.O_RDONLY | noFollow);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== pathStat.dev || opened.ino !== pathStat.ino || opened.size > 64) {
      throw new Error("AlphaWay process lock changed or has an invalid size");
    }
    const buffer = Buffer.alloc(65);
    const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const value = buffer.subarray(0, count).toString("ascii").trim();
    if (!/^\d+$/.test(value)) {
      throw new Error("AlphaWay process lock has an invalid PID; inspect and remove it manually if no AlphaWay process is running");
    }
    const pid = Number(value);
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      throw new Error("AlphaWay process lock has an invalid PID; inspect and remove it manually if no AlphaWay process is running");
    }
    return pid;
  } finally {
    fs.closeSync(fd);
  }
}

function ensureLockDirectory(directory: string): string {
  ensurePrivateDirectory(directory);
  return fs.realpathSync(directory);
}

/**
 * Resolve a database-specific lock beside the canonical SQLite file. realpath
 * makes two DB_PATH aliases for the same existing file share one lock.
 */
export function getAlphaWayDatabaseLockPath(databasePath: string = resolveDatabasePath()): string | null {
  if (databasePath === ":memory:") return null;
  const absolutePath = path.resolve(databasePath);
  const realDirectory = ensureLockDirectory(path.dirname(absolutePath));
  let canonicalPath = path.join(realDirectory, path.basename(absolutePath));
  try {
    const databaseStat = fs.lstatSync(absolutePath);
    if (databaseStat.isSymbolicLink() || !databaseStat.isFile()) {
      throw new Error("AlphaWay DB_PATH must resolve to a regular, non-symlink SQLite file");
    }
    canonicalPath = fs.realpathSync(absolutePath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  return canonicalPath + ".alphaway.lock";
}

function acquireLockFile(lockPath: string, scope: string): () => void {
  let fd: number;
  try {
    fd = fs.openSync(lockPath, "wx", 0o600);
  } catch (error: any) {
    if (error?.code !== "EEXIST") throw error;
    const existingPid = readLockPid(lockPath);
    if (isProcessAlive(existingPid)) {
      throw new Error("AlphaWay process PID " + existingPid + " is already holding the " + scope + " lock");
    }
    // Fail closed on stale locks. Automatic unlink after a separate PID check
    // has a TOCTOU race with a concurrent startup; require operator cleanup.
    throw new Error("A stale AlphaWay process lock exists (" + scope + "). Remove " + lockPath + " only after confirming no AlphaWay process is using it.");
  }

  let lockIdentity: { dev: number; ino: number };
  try {
    fs.writeFileSync(fd, String(process.pid) + "\n", "ascii");
    fs.fsyncSync(fd);
    const stat = fs.fstatSync(fd);
    lockIdentity = { dev: stat.dev, ino: stat.ino };
  } finally {
    fs.closeSync(fd);
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.off("exit", release);
    try {
      const stat = fs.lstatSync(lockPath);
      if (
        stat.isFile() &&
        !stat.isSymbolicLink() &&
        stat.dev === lockIdentity.dev &&
        stat.ino === lockIdentity.ino &&
        readLockPid(lockPath) === process.pid
      ) {
        fs.unlinkSync(lockPath);
      }
    } catch {}
  };
  process.once("exit", release);
  return release;
}

/**
 * Hold both the legacy data-directory lock and a database-path lock.
 *
 * The first preserves compatibility with services launched by earlier
 * AlphaWay releases. The second prevents two DATA_DIR values that point at
 * the same DB_PATH from opening concurrent writers to one SQLite file.
 * Restore passes its actual destination path so it cannot bypass a lock held
 * by another AlphaWay instance using that database.
 */
export function acquireAlphaWayProcessLock(databasePath: string = resolveDatabasePath()): () => void {
  const dataDir = resolveDataDir();
  ensurePrivateDirectory(dataDir);

  const lockPaths: Array<{ path: string; scope: string }> = [
    { path: path.join(dataDir, "alphaway.lock"), scope: "data-directory" },
  ];
  const databaseLockPath = getAlphaWayDatabaseLockPath(databasePath);
  if (databaseLockPath && !lockPaths.some((entry) => entry.path === databaseLockPath)) {
    lockPaths.push({ path: databaseLockPath, scope: "database" });
  }

  const releases: Array<() => void> = [];
  try {
    for (const lock of lockPaths) {
      releases.push(acquireLockFile(lock.path, lock.scope));
    }
  } catch (error) {
    for (const release of releases.reverse()) release();
    throw error;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const release of releases.reverse()) release();
  };
}
