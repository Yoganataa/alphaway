/**
 * Authenticated encryption for upstream credentials persisted in SQLite.
 *
 * By default AlphaWay generates a 256-bit local master key at
 * $DATA_DIR/secret-encryption.key (0600 on POSIX). Operators may instead
 * provide ALPHAWAY_ENCRYPTION_KEY as 64 hexadecimal characters or base64
 * encoding of exactly 32 bytes. Back up this key separately from the database.
 */

import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ensurePrivateDirectory, resolveDataDir } from "./storage-paths";


const ENVELOPE_V1 = "awenc:v1:";
const ENVELOPE_V2 = "awenc:v2:";
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

function sameKeyFileSnapshot(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs;
}

function readKeyFile(filePath: string): Buffer {
  const pathStat = fs.lstatSync(filePath);
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
    throw new Error("Secret encryption key path must be a regular file");
  }
  const noFollow = process.platform === "win32" ? 0 : (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== pathStat.dev || opened.ino !== pathStat.ino) {
      throw new Error("Secret encryption key path changed while it was being opened");
    }
    if (process.platform !== "win32") fs.fchmodSync(fd, 0o600);
    // Establish a stable snapshot after permission hardening. The key must be
    // exactly 32 bytes; read at most one sentinel byte beyond that limit.
    const baseline = fs.fstatSync(fd);
    if (!baseline.isFile() || baseline.size !== KEY_BYTES) {
      throw new Error("Secret encryption key file has an invalid length; restore the original key before continuing");
    }
    const value = Buffer.alloc(KEY_BYTES);
    let offset = 0;
    while (offset < KEY_BYTES) {
      const bytesRead = fs.readSync(fd, value, offset, KEY_BYTES - offset, null);
      if (bytesRead === 0) {
        throw new Error("Secret encryption key file has an invalid length; restore the original key before continuing");
      }
      offset += bytesRead;
    }
    const sentinel = Buffer.alloc(1);
    if (fs.readSync(fd, sentinel, 0, 1, null) !== 0) {
      throw new Error("Secret encryption key file has an invalid length; restore the original key before continuing");
    }
    const afterRead = fs.fstatSync(fd);
    if (!sameKeyFileSnapshot(baseline, afterRead)) {
      throw new Error("Secret encryption key file changed while it was being read");
    }
    return value;
  } finally {
    fs.closeSync(fd);
  }
}
function loadOrCreateKey(): Buffer {
  const override = configuredKey();
  if (override) return override;

  const directory = resolveDataDir();
  ensurePrivateDirectory(directory);

  const filePath = path.join(directory, "secret-encryption.key");
  try {
    return readKeyFile(filePath);
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
    const existing = readKeyFile(filePath);
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

/** Reset only the in-memory key cache between isolated unit tests. */
export function __resetSecretKeyCacheForTests(): void {
  cachedKey = null;
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === "string" &&
    (value.startsWith(ENVELOPE_V1) || value.startsWith(ENVELOPE_V2));
}

/** Internal file-backup encryption key access; returns a defensive copy. */
export function getSecretEncryptionKeyForBackup(): Buffer {
  return Buffer.from(masterKey());
}

export function encryptSecret(value: string | null | undefined): string {
  const plaintext = String(value || "");
  if (!plaintext || isEncryptedSecret(plaintext)) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENVELOPE_V1 + [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(value: string | null | undefined): string {
  const stored = String(value || "");
  if (!isEncryptedSecret(stored)) return stored;

  const prefix = stored.startsWith(ENVELOPE_V2) ? ENVELOPE_V2 : ENVELOPE_V1;
  const parts = stored.slice(prefix.length).split(".");
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
