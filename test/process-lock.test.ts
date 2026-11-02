import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireAlphaWayProcessLock } from "../src/core/process-lock";

const previousDataDir = process.env.DATA_DIR;
let temporaryDirectory = "";

function useTemporaryDataDir(): string {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-process-lock-"));
  process.env.DATA_DIR = temporaryDirectory;
  return temporaryDirectory;
}

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = "";
});

describe("AlphaWay process/data-directory lock", () => {
  it("allows only one server or restore process to hold the data directory", () => {
    const directory = useTemporaryDataDir();
    const lockPath = path.join(directory, "alphaway.pid");
    const release = acquireAlphaWayProcessLock();

    expect(fs.readFileSync(lockPath, "utf8").trim()).toBe(String(process.pid));
    expect(() => acquireAlphaWayProcessLock()).toThrow(/already holding the data-directory lock/);

    release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("fails closed on a stale PID file instead of racing an automatic unlink", () => {
    const directory = useTemporaryDataDir();
    const lockPath = path.join(directory, "alphaway.pid");
    fs.writeFileSync(lockPath, "2147483647\n", { mode: 0o600 });

    expect(() => acquireAlphaWayProcessLock()).toThrow(/stale AlphaWay process lock/);
    expect(fs.readFileSync(lockPath, "utf8")).toBe("2147483647\n");
  });

  it("refuses a symlink at the process lock path", () => {
    if (process.platform === "win32") return;
    const directory = useTemporaryDataDir();
    const lockPath = path.join(directory, "alphaway.pid");
    const target = path.join(directory, "target");
    fs.writeFileSync(target, "2147483647\n");
    fs.symlinkSync(target, lockPath);

    expect(() => acquireAlphaWayProcessLock()).toThrow(/non-symlink file/);
    expect(fs.readFileSync(target, "utf8")).toBe("2147483647\n");
  });
});
