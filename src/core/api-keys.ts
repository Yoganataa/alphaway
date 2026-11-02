import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getDatabase } from "./database";
import { normalizeAllowedModels } from "./plans";

export interface APIKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number | null;
  requestsCount: number;
  status: "active" | "revoked";
  planId: string | null;
  planName: string | null;
  rateLimitRpm: number | null;
  rateLimitTpm: number | null;
  concurrencyLimit: number | null;
  tokenQuota: number | null;
  allowedModels: string[] | null;
  totalTokensUsed: number;
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
    planId: row.plan_id == null ? null : String(row.plan_id),
    planName: row.plan_name == null ? null : String(row.plan_name),
    rateLimitRpm: row.rate_limit_rpm == null ? null : Number(row.rate_limit_rpm),
    rateLimitTpm: row.rate_limit_tpm == null ? null : Number(row.rate_limit_tpm),
    concurrencyLimit: row.concurrency_limit == null ? null : Number(row.concurrency_limit),
    tokenQuota: row.token_quota == null ? null : Number(row.token_quota),
    allowedModels: row.allowed_models == null ? null : (() => { try { const value = JSON.parse(row.allowed_models); return normalizeAllowedModels(value); } catch { return []; } })(),
    totalTokensUsed: Number(row.total_tokens_used || 0),
  };
}

function newSecret(): string {
  return `sk-aw-${randomBytes(32).toString("base64url")}`;
}

export function listAPIKeys(): APIKeyRecord[] {
  const rows = getDatabase().prepare(
    "SELECT k.*, p.name AS plan_name FROM api_keys k LEFT JOIN plans p ON p.id = k.plan_id ORDER BY k.created_at DESC"
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

export interface APIKeyPolicyPatch {
  planId?: string | null;
  rateLimitRpm?: number | null;
  rateLimitTpm?: number | null;
  concurrencyLimit?: number | null;
  tokenQuota?: number | null;
  allowedModels?: string[] | null;
}

function normalizeOverride(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error(field + " must be null or an integer from 0 to 1000000");
  }
  return value;
}

/** Update the Plan assignment and nullable per-key policy overrides atomically. */
export function setAPIKeyPolicy(id: string, patch: APIKeyPolicyPatch): APIKeyRecord | null {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("A policy object is required");
  const db = getDatabase();
  const current = db.prepare("SELECT * FROM api_keys WHERE id = ? AND status = 'active'").get(id);
  if (!current) return null;

  let planId = current.plan_id == null ? null : String(current.plan_id);
  if (Object.prototype.hasOwnProperty.call(patch, "planId")) {
    if (patch.planId !== null && (typeof patch.planId !== "string" || !patch.planId.trim() || patch.planId.length > 128)) {
      throw new Error("planId must be a valid Plan ID or null");
    }
    planId = typeof patch.planId === "string" ? patch.planId.trim() : null;
    if (planId && !db.prepare("SELECT 1 AS found FROM plans WHERE id = ?").get(planId)) {
      throw new Error("The selected Plan does not exist");
    }
  }

  const rpm = Object.prototype.hasOwnProperty.call(patch, "rateLimitRpm")
    ? normalizeOverride(patch.rateLimitRpm, "rateLimitRpm")
    : current.rate_limit_rpm == null ? null : Number(current.rate_limit_rpm);
  const tpm = Object.prototype.hasOwnProperty.call(patch, "rateLimitTpm")
    ? normalizeOverride(patch.rateLimitTpm, "rateLimitTpm")
    : current.rate_limit_tpm == null ? null : Number(current.rate_limit_tpm);
  const concurrency = Object.prototype.hasOwnProperty.call(patch, "concurrencyLimit")
    ? normalizeOverride(patch.concurrencyLimit, "concurrencyLimit")
    : current.concurrency_limit == null ? null : Number(current.concurrency_limit);
  const tokenQuota = Object.prototype.hasOwnProperty.call(patch, "tokenQuota")
    ? normalizeOverride(patch.tokenQuota, "tokenQuota")
    : current.token_quota == null ? null : Number(current.token_quota);

  let allowedModels: string | null = current.allowed_models == null ? null : String(current.allowed_models);
  if (Object.prototype.hasOwnProperty.call(patch, "allowedModels")) {
    if (patch.allowedModels === null) allowedModels = null;
    else allowedModels = JSON.stringify(normalizeAllowedModels(patch.allowedModels));
  }

  db.prepare("UPDATE api_keys SET plan_id = ?, rate_limit_rpm = ?, rate_limit_tpm = ?, concurrency_limit = ?, token_quota = ?, allowed_models = ? WHERE id = ? AND status = 'active'")
    .run(planId, rpm, tpm, concurrency, tokenQuota, allowedModels, id);

  const row = db.prepare("SELECT k.*, p.name AS plan_name FROM api_keys k LEFT JOIN plans p ON p.id = k.plan_id WHERE k.id = ?").get(id);
  return row ? toRecord(row) : null;
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
