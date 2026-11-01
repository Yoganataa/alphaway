/**
 * Authenticated encryption for upstream credentials persisted in SQLite.
 *
 * By default AlphaWay generates a 256-bit local master key at
 * ~/.alphaway/secret-encryption.key (0600 on POSIX). Operators may instead
 * provide ALPHAWAY_ENCRYPTION_KEY as 64 hexadecimal characters or base64
 * encoding of exactly 32 bytes. Back up this key separately from the database.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";


const ENVELOPE = "awenc:v1:";
const KEY_BYTES = 32;
const IV_BYTES = 12;
let cachedKey: Buffer | null = null;

function configuredKey(): Buffer | null {
  const configured = process.env.ALPHAWAY_ENCRYPTION_KEY?.trim();
  if (!configured) return null;

  let value: Buffer;
  if (/^[a-fA-F0-9]{64}$/.test(configured)) {
    value = Buffer.from(configured, "hex");
  } else {
    try {
      value = Buffer.from(configured, "base64");
    } catch {
      throw new Error("ALPHAWAY_ENCRYPTION_KEY must be 64 hex characters or base64 for 32 bytes");
    }
  }
  if (value.length !== KEY_BYTES) {
    throw new Error("ALPHAWAY_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return value;
}

function loadOrCreateKey(): Buffer {
  const override = configuredKey();
  if (override) return override;

  const configuredDirectory = process.env.ALPHAWAY_STATE_DIR || process.env.OPENCODE_BRIDGE_STATE_DIR;
  const directory = configuredDirectory && String(configuredDirectory).trim()
    ? String(configuredDirectory).trim()
    : path.join(os.homedir(), ".alphaway");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try { fs.chmodSync(directory, 0o700); } catch {}
  }

  const filePath = path.join(directory, "secret-encryption.key");
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("Secret encryption key path must be a regular file");
    }
    const value = fs.readFileSync(filePath);
    if (value.length !== KEY_BYTES) {
      throw new Error("Secret encryption key file has an invalid length; restore the original key before continuing");
    }
    if (process.platform !== "win32") {
      try { fs.chmodSync(filePath, 0o600); } catch {}
    }
    return value;
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }

  const value = randomBytes(KEY_BYTES);
  try {
    const fd = fs.openSync(filePath, "wx", 0o600);
    try {
      fs.writeFileSync(fd, value);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (error: any) {
    if (error?.code !== "EEXIST") throw error;
    const existing = fs.readFileSync(filePath);
    if (existing.length !== KEY_BYTES) {
      throw new Error("Concurrent secret encryption key creation produced an invalid file");
    }
    return existing;
  }
  if (process.platform !== "win32") {
    try { fs.chmodSync(filePath, 0o600); } catch {}
  }
  return value;
}

function masterKey(): Buffer {
  if (!cachedKey) cachedKey = loadOrCreateKey();
  return cachedKey;
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENVELOPE);
}

export function encryptSecret(value: string | null | undefined): string {
  const plaintext = String(value || "");
  if (!plaintext || isEncryptedSecret(plaintext)) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENVELOPE + [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(value: string | null | undefined): string {
  const stored = String(value || "");
  if (!isEncryptedSecret(stored)) return stored;

  const parts = stored.slice(ENVELOPE.length).split(".");
  if (parts.length !== 3) throw new Error("Stored secret has an invalid encryption envelope");

  const [ivText, tagText, ciphertextText] = parts;
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  const ciphertext = Buffer.from(ciphertextText, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== 16) {
    throw new Error("Stored secret has an invalid AES-256-GCM envelope");
  }

  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
