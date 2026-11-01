import { describe, it, expect } from "bun:test";
import * as daemon from "../src/features/daemon";

describe("daemon module", () => {
  it("exports daemon lifecycle management functions", () => {
    expect(typeof daemon.getStateDir).toBe("function");
    expect(typeof daemon.getPidFilePath).toBe("function");
    expect(typeof daemon.getLogFilePath).toBe("function");
    expect(typeof daemon.isPidAlive).toBe("function");
    expect(typeof daemon.showStatus).toBe("function");
    expect(typeof daemon.stopDaemon).toBe("function");
    expect(typeof daemon.spawnDaemon).toBe("function");
    expect(typeof daemon.handleDaemonCli).toBe("function");
  });

  it("returns correct paths for PID and log files", () => {
    const pidPath = daemon.getPidFilePath();
    const logPath = daemon.getLogFilePath();
    expect(typeof pidPath === "string" && pidPath.endsWith("alphaway.pid")).toBe(true);
    expect(typeof logPath === "string" && logPath.endsWith("alphaway.log")).toBe(true);
  });

  it("checks process liveness correctly", () => {
    expect(daemon.isPidAlive(process.pid)).toBe(true);
    expect(daemon.isPidAlive(99999999)).toBe(false);
    expect(daemon.isPidAlive(null as any)).toBe(false);
    expect(daemon.isPidAlive(undefined as any)).toBe(false);
    expect(daemon.isPidAlive("not-a-pid" as any)).toBe(false);
  });

  it("showStatus returns boolean without throwing", () => {
    const result = daemon.showStatus(20129, "127.0.0.1", "https://example.com");
    expect(typeof result === "boolean").toBe(true);
  });
});
