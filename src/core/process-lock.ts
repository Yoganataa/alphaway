import fs from "node:fs";
import path from "node:path";
import { ensurePrivateDirectory, resolveDataDir } from "./storage-paths";

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

/**
 * Hold the canonical AlphaWay PID file for the lifetime of the running server.
 * The same exclusive file creation is used by database restore, so service
 * startup and restore cannot pass their stopped/running checks concurrently.
 */
export function acquireAlphaWayProcessLock(): () => void {
  const dataDir = resolveDataDir();
  ensurePrivateDirectory(dataDir);
  const lockPath = path.join(dataDir, "alphaway.lock");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let fd: number;
    try {
      fd = fs.openSync(lockPath, "wx", 0o600);
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      const existingPid = readLockPid(lockPath);
      if (isProcessAlive(existingPid)) {
        throw new Error(`AlphaWay process PID ${existingPid} is already holding the data-directory lock`);
      }
      // Fail closed on stale locks. Automatic unlink after a separate PID check
      // has a TOCTOU race with a concurrent startup; use --status to remove a
      // stale PID file after confirming that no AlphaWay process is running.
      throw new Error("A stale AlphaWay process lock exists. Remove the alphaway.lock file only after confirming that no AlphaWay process is running.");
    }

    try {
      fs.writeFileSync(fd, `${process.pid}\n`, "ascii");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      process.off("exit", release);
      try {
        if (readLockPid(lockPath) === process.pid) fs.unlinkSync(lockPath);
      } catch {}
    };
    process.once("exit", release);
    return release;
  }

  throw new Error("Could not acquire the AlphaWay data-directory lock; retry startup");
}
