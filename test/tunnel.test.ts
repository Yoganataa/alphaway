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
  it("extracts only HTTPS URLs with a real trycloudflare.com hostname", () => {
    expect(tunnel.extractQuickTunnelUrl(
      "INF Registered quick tunnel connection: https://quick-123.trycloudflare.com/path",
    )).toBe("https://quick-123.trycloudflare.com");
  });

  it("rejects URL substring and hostname-suffix spoofing", () => {
    for (const value of [
      "https://quick-123.trycloudflare.com.evil.example",
      "https://evil.example/path/https://quick-123.trycloudflare.com",
      "https://quick-123.trycloudflare.com@evil.example",
      "https://evil.example/?next=https://quick-123.trycloudflare.com",
      "http://quick-123.trycloudflare.com",
      "https://user@quick-123.trycloudflare.com",
      "https://quick-123.trycloudflare.com:8443",
      "https://trycloudflare.com",
    ]) {
      expect(tunnel.extractQuickTunnelUrl(value)).toBeNull();
    }
  });

});
