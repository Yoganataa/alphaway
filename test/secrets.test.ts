import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { __resetSecretKeyCacheForTests, decryptSecret, deriveSecretIdentifier, encryptSecret, isEncryptedSecret } from "../src/core/secrets";

let stateDir = "";
let keyPath = "";
let previousDataDir: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.DATA_DIR;
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-secrets-test-"));
  process.env.DATA_DIR = stateDir;
  keyPath = path.join(stateDir, "secret-encryption.key");
  __resetSecretKeyCacheForTests();
});

afterEach(() => {
  __resetSecretKeyCacheForTests();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  fs.rmSync(stateDir, { recursive: true, force: true });
});

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

  it("derives stable purpose-separated identifiers with the local master key", () => {
    const input = "http://proxy-user:guessable-password@proxy.example:8080";
    const first = deriveSecretIdentifier("proxy-health-id:v2", input);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveSecretIdentifier("proxy-health-id:v2", input)).toBe(first);
    expect(deriveSecretIdentifier("other-purpose", input)).not.toBe(first);
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