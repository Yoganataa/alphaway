import { describe, it, expect } from "bun:test";
import * as tunnel from "../src/features/tunnel";

describe("tunnel module", () => {
  it("exports findCloudflaredBinary and startTunnel", () => {
    expect(typeof tunnel.findCloudflaredBinary).toBe("function");
    expect(typeof tunnel.startTunnel).toBe("function");
  });

  it("finds cloudflared binary on the current system or returns null gracefully", () => {
    const bin = tunnel.findCloudflaredBinary();
    if (bin) {
      expect(typeof bin).toBe("string");
      expect(bin.includes("cloudflared")).toBe(true);
    }
  });
});
