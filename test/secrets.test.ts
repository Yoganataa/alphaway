import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "../src/core/secrets";

const stateDir = process.env.DATA_DIR;
if (!stateDir) throw new Error("test/setup.ts must set DATA_DIR before secret tests run");
const keyPath = path.join(stateDir, "secret-encryption.key");

describe("authenticated secret storage", () => {
  it("refuses a symlink at the master-key path", () => {
    if (process.platform === "win32") return;
    fs.mkdirSync(stateDir, { recursive: true });
    const target = path.join(stateDir, "unexpected-key-target");
    fs.writeFileSync(target, Buffer.alloc(32, 7));
    try {
      fs.symlinkSync(target, keyPath);
      expect(() => encryptSecret("must-not-follow-symlink")).toThrow(/regular file/);
    } finally {
      try { fs.unlinkSync(keyPath); } catch {}
      try { fs.unlinkSync(target); } catch {}
    }
  });

  it("rejects an oversized master-key file without reading its full contents", () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(keyPath, Buffer.alloc(1024 * 1024, 7));
    try {
      expect(() => encryptSecret("must-not-load-oversized-master-key")).toThrow(/invalid length/);
    } finally {
      try { fs.unlinkSync(keyPath); } catch {}
    }
  });

  it("encrypts secrets with unique nonces and decrypts only the authenticated value", () => {
    const first = encryptSecret("provider-token-for-round-trip");
    const second = encryptSecret("provider-token-for-round-trip");

    expect(isEncryptedSecret(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(first).not.toContain("provider-token-for-round-trip");
    expect(decryptSecret(first)).toBe("provider-token-for-round-trip");
    expect(decryptSecret(second)).toBe("provider-token-for-round-trip");
    expect(encryptSecret(first)).toBe(first);
    expect(encryptSecret("")).toBe("");
  });

  it("rejects a tampered authentication tag", () => {
    const encrypted = encryptSecret("authenticated-payload");
    const parts = encrypted.slice("awenc:v1:".length).split(".");
    const replacement = parts[1][0] === "A" ? "B" : "A";
    parts[1] = replacement + parts[1].slice(1);
    const tampered = "awenc:v1:" + parts.join(".");

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("creates a 32-byte owner-only key file on POSIX", () => {
    const encrypted = encryptSecret("ensure-master-key-exists");
    expect(decryptSecret(encrypted)).toBe("ensure-master-key-exists");
    const stat = fs.statSync(keyPath);
    expect(stat.size).toBe(32);
    if (process.platform !== "win32") {
      expect(stat.mode & 0o777).toBe(0o600);
    }
  });
});