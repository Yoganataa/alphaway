"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { resolveDataDir, ensurePrivateDirectory } = require("../core/storage-paths");
const { acquireAlphaWayProcessLock } = require("../core/process-lock");

function getStateDir() {
  const dir = resolveDataDir();
  ensurePrivateDirectory(dir);
  return dir;
}

function getPidFilePath() {
  return path.join(getStateDir(), "alphaway.pid");
}

function getLogFilePath() {
  return path.join(getStateDir(), "alphaway.log");
}

function isPidAlive(pid) {
  if (!pid || typeof pid !== "number" || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function showStatus(port = 20129, host = "127.0.0.1", publicUrl = "") {
  const pidFile = getPidFilePath();
  if (!fs.existsSync(pidFile)) {
    console.log("[AlphaWay] Status: STOPPED (no PID file).");
    return false;
  }
  const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
  if (!pid || !isPidAlive(pid)) {
    console.log(`[AlphaWay] Status: STOPPED (stale PID ${pid}).`);
    try { fs.unlinkSync(pidFile); } catch {}
    return false;
  }
  console.log(`[AlphaWay] Status: RUNNING (PID: ${pid})`);
  console.log(`[AlphaWay] Local:  http://${host}:${port}/v1`);
  if (publicUrl) {
    console.log(`[AlphaWay] Public: ${publicUrl}/v1`);
  }
  console.log(`[AlphaWay] Logs:   ${getLogFilePath()}`);
  return true;
}

function stopDaemon() {
  const pidFile = getPidFilePath();
  if (!fs.existsSync(pidFile)) {
    console.log("[AlphaWay] No daemon is currently running (no PID file).");
    return;
  }
  const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
  if (!pid || isNaN(pid)) {
    console.log("[AlphaWay] Invalid PID file. Removed.");
    try { fs.unlinkSync(pidFile); } catch {}
    return;
  }
  if (!isPidAlive(pid)) {
    console.log(`[AlphaWay] Daemon process ${pid} is not running (stale PID removed).`);
    try { fs.unlinkSync(pidFile); } catch {}
    return;
  }

  console.log(`[AlphaWay] Stopping daemon (PID: ${pid})...`);
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    console.warn(`[AlphaWay] Could not send SIGTERM: ${err.message}`);
  }

  const start = Date.now();
  let stopped = false;
  while (Date.now() - start < 3000) {
    if (!isPidAlive(pid)) {
      stopped = true;
      break;
    }
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    } catch {}
  }

  if (!stopped && isPidAlive(pid)) {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }

  try { fs.unlinkSync(pidFile); } catch {}
  console.log("[AlphaWay] Daemon stopped successfully.");
}

function spawnDaemon(port = 20129, host = "127.0.0.1", publicUrl = "") {
  const pidFile = getPidFilePath();
  if (fs.existsSync(pidFile)) {
    const existingPid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (existingPid && isPidAlive(existingPid)) {
      console.log(`[AlphaWay] Daemon is already running (PID: ${existingPid}).`);
      console.log(`[AlphaWay] Local:  http://${host}:${port}/v1`);
      if (publicUrl) console.log(`[AlphaWay] Public: ${publicUrl}/v1`);
      console.log(`[AlphaWay] Logs:   ${getLogFilePath()}`);
      console.log(`[AlphaWay] To stop: bun src/index.ts --stop`);
      process.exit(0);
    }
  }

  const logFile = getLogFilePath();
  const outLog = fs.openSync(logFile, "a");
  const errLog = outLog;

  const childArgs = process.argv
    .slice(1)
    .filter((arg) => arg !== "--daemon" && arg !== "-d" && arg !== "--background");
  if (childArgs.length > 0) {
    childArgs[0] = path.resolve(childArgs[0]);
  }

  const child = spawn(process.argv[0], childArgs, {
    detached: true,
    stdio: ["ignore", outLog, errLog],
    env: { ...process.env, __OC_DAEMON: "1" },
    cwd: process.cwd(),
  });

  child.unref();

  // The child acquires the shared exclusive PID lock after startup; do not
  // pre-create it here or the child would mistake its parent-created file for
  // another running AlphaWay process.
  console.log(`[AlphaWay] Daemon started successfully in background! (PID: ${child.pid})`);
  console.log(`[AlphaWay] Local API: http://${host}:${port}/v1`);
  if (publicUrl) {
    console.log(`[AlphaWay] Public URL: ${publicUrl}/v1`);
  }
  console.log(`[AlphaWay] Log file: ${logFile}`);
  console.log(`[AlphaWay] To check status: bun src/index.ts --status`);
  console.log(`[AlphaWay] To stop:         bun src/index.ts --stop`);
  process.exit(0);
}

function handleDaemonCli(port, host, publicUrl) {
  if (process.argv.includes("--stop")) {
    stopDaemon();
    process.exit(0);
  }

  if (process.argv.includes("--status")) {
    showStatus(port, host, publicUrl);
    process.exit(0);
  }

  const wantDaemon =
    process.argv.includes("--daemon") ||
    process.argv.includes("-d") ||
    process.argv.includes("--background") ||
    process.env.DAEMON === "1";

  if (wantDaemon && process.env.__OC_DAEMON !== "1") {
    spawnDaemon(port, host, publicUrl);
    process.exit(0);
  }

  // Every foreground, systemd/launchd, and daemon process holds the same
  // exclusive data-directory lock. Database restore acquires this lock too.
  acquireAlphaWayProcessLock();
}

module.exports = {
  getStateDir,
  getPidFilePath,
  getLogFilePath,
  isPidAlive,
  showStatus,
  stopDaemon,
  spawnDaemon,
  handleDaemonCli,
};
