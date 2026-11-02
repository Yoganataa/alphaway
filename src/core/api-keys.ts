import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getDatabase } from "./database";

export interface APIKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number | null;
  requestsCount: number;
  status: "active" | "revoked";
}

export interface APIKeyCredential {
  id: string;
  scopes: string[];
}

export interface IssuedAPIKey {
  record: APIKeyRecord;
  secret: string;
}

function digest(secret: string, saltHex: string): Buffer {
  return createHash("sha256")
    .update(Buffer.from(saltHex, "hex"))
    .update(secret, "utf8")
    .digest();
}

function safeDigestMatch(secret: string, saltHex: string, storedHashHex: string): boolean {
  const actual = digest(secret, saltHex);
  const expected = Buffer.from(storedHashHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function safeSecretMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function toRecord(row: any): APIKeyRecord {
  let scopes: string[] = ["inference"];
  try {
    const parsed = JSON.parse(row.scopes || "[]");
    if (Array.isArray(parsed)) scopes = parsed.filter((value: unknown) => typeof value === "string");
  } catch {}
  return {
    id: String(row.id),
    name: String(row.name),
    prefix: String(row.key_prefix),
    scopes,
    createdAt: Number(row.created_at),
    lastUsedAt: row.last_used_at == null ? null : Number(row.last_used_at),
    requestsCount: Number(row.requests_count || 0),
    status: row.status === "revoked" ? "revoked" : "active",
  };
}

function newSecret(): string {
  return `sk-aw-${randomBytes(32).toString("base64url")}`;
}

export function listAPIKeys(): APIKeyRecord[] {
  const rows = getDatabase().prepare(
    "SELECT id, name, key_prefix, scopes, status, created_at, last_used_at, requests_count FROM api_keys ORDER BY created_at DESC"
  ).all();
  return rows.map(toRecord);
}

export function issueAPIKey(nameInput: string): IssuedAPIKey {
  const name = String(nameInput || "").trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("API key name must contain 1–80 printable characters");

  const db = getDatabase();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const secret = newSecret();
    const salt = randomBytes(16).toString("hex");
    const id = randomUUID();
    const prefix = secret.slice(0, 16);
    try {
      db.prepare(`
        INSERT INTO api_keys (
          id, name, key_prefix, secret_salt, secret_hash, scopes,
          status, created_at, last_used_at, requests_count, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, 0, NULL)
      `).run(id, name, prefix, salt, digest(secret, salt).toString("hex"), JSON.stringify(["inference"]), Date.now());

      const row = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(id);
      return { record: toRecord(row), secret };
    } catch (error: any) {
      if (!String(error?.message || "").includes("UNIQUE")) throw error;
    }
  }
  throw new Error("Could not allocate a unique API key; retry the operation");
}

export function findActiveAPIKey(secretInput: string): APIKeyCredential | null {
  const secret = String(secretInput || "").trim();
  if (secret.length < 16 || secret.length > 256) return null;

  const prefix = secret.slice(0, 16);
  const rows = getDatabase().prepare(
    "SELECT id, secret_salt, secret_hash, scopes FROM api_keys WHERE key_prefix = ? AND status = 'active'"
  ).all(prefix);

  for (const row of rows) {
    if (!safeDigestMatch(secret, row.secret_salt, row.secret_hash)) continue;
    let scopes: string[] = [];
    try {
      const parsed = JSON.parse(row.scopes || "[]");
      if (Array.isArray(parsed)) scopes = parsed.filter((value: unknown) => typeof value === "string");
    } catch {}
    return { id: String(row.id), scopes };
  }
  return null;
}

export function recordAPIKeyUse(id: string): void {
  getDatabase().prepare(
    "UPDATE api_keys SET last_used_at = ?, requests_count = requests_count + 1 WHERE id = ? AND status = 'active'"
  ).run(Date.now(), id);
}

export function renameAPIKey(id: string, nameInput: string): APIKeyRecord | null {
  const name = String(nameInput || "").trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("API key name must contain 1–80 printable characters");
  const db = getDatabase();
  const result = db.prepare("UPDATE api_keys SET name = ? WHERE id = ? AND status = 'active'").run(name, id);
  if (!Number(result.changes || 0)) return null;
  return toRecord(db.prepare("SELECT * FROM api_keys WHERE id = ?").get(id));
}

export function revokeAPIKey(id: string): boolean {
  const now = Date.now();
  const result = getDatabase().prepare(
    "UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'active'"
  ).run(now, id);
  return Number(result.changes || 0) > 0;
}

export function rotateAPIKey(id: string): IssuedAPIKey | null {
  const db = getDatabase();
  const existing = db.prepare("SELECT * FROM api_keys WHERE id = ? AND status = 'active'").get(id);
  if (!existing) return null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const secret = newSecret();
    const salt = randomBytes(16).toString("hex");
    const prefix = secret.slice(0, 16);
    const result = db.prepare(`
      UPDATE api_keys
      SET key_prefix = ?, secret_salt = ?, secret_hash = ?, created_at = ?,
          last_used_at = NULL, requests_count = 0, revoked_at = NULL
      WHERE id = ? AND status = 'active'
    `).run(prefix, salt, digest(secret, salt).toString("hex"), Date.now(), id);
    if (Number(result.changes || 0)) {
      const row = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(id);
      return { record: toRecord(row), secret };
    }
  }
  throw new Error("Could not rotate API key; retry the operation");
}

export function verifyEnvironmentAPIKey(candidate: string, configured: string): boolean {
  const raw = String(candidate || "").trim();
  const expected = String(configured || "").trim();
  if (!raw || !expected) return false;
  const variants = expected.startsWith("sk-") ? [expected] : [expected, `sk-${expected}`];
  let matched = false;
  for (const variant of variants) {
    matched = safeSecretMatch(raw, variant) || matched;
  }
  return matched;
}
