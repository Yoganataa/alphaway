import { randomUUID } from "node:crypto";
import { getDatabase } from "./database";

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 256;
const MAX_MODELS = 100;
const MAX_MODEL_PATTERN_LENGTH = 128;
const MAX_POLICY_LIMIT = 1_000_000;

export interface Plan {
  id: string;
  name: string;
  description: string;
  rpmLimit: number;
  tpmLimit: number;
  concurrencyLimit: number;
  tokenQuota: number;
  allowedModels: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PlanInput {
  name: string;
  description: string;
  rpmLimit: number;
  tpmLimit: number;
  concurrencyLimit: number;
  tokenQuota: number;
  allowedModels: string[];
}

export interface PlanInUseError extends Error {
  code: "plan_in_use";
  assignedKeyCount: number;
}

export function normalizeAllowedModels(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > MAX_MODELS) {
    throw new Error(`allowedModels must be an array with at most ${MAX_MODELS} entries`);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") throw new Error("Model allowlist entries must be strings");
    const value = raw.trim();
    if (
      !value ||
      value.length > MAX_MODEL_PATTERN_LENGTH ||
      /[\u0000-\u001f\u007f]/.test(value) ||
      value === "*" ||
      !/^[A-Za-z0-9_./:+-]+\*?$/.test(value)
    ) {
      throw new Error("Model allowlist entries must be exact model IDs or prefix patterns ending in '*'");
    }
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeLimit(value: unknown, field: string, fallback = 0): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX_POLICY_LIMIT) {
    throw new Error(`${field} must be an integer from 0 to ${MAX_POLICY_LIMIT}`);
  }
  return number;
}

function normalizePlanInput(input: unknown, existing?: Plan): PlanInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("A Plan JSON object is required");
  }
  const source = input as Record<string, unknown>;
  const rawName = source.name === undefined ? existing?.name : source.name;
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error(`Plan name must contain 1–${MAX_NAME_LENGTH} printable characters`);
  }

  const rawDescription = source.description === undefined ? existing?.description ?? "" : source.description;
  if (typeof rawDescription !== "string" || rawDescription.length > MAX_DESCRIPTION_LENGTH || /[\u0000-\u001f\u007f]/.test(rawDescription)) {
    throw new Error(`Plan description must be at most ${MAX_DESCRIPTION_LENGTH} printable characters`);
  }

  const rawModels = source.allowedModels === undefined ? existing?.allowedModels ?? [] : source.allowedModels;
  return {
    name,
    description: rawDescription.trim(),
    rpmLimit: normalizeLimit(source.rpmLimit, "rpmLimit", existing?.rpmLimit ?? 0),
    tpmLimit: normalizeLimit(source.tpmLimit, "tpmLimit", existing?.tpmLimit ?? 0),
    concurrencyLimit: normalizeLimit(source.concurrencyLimit, "concurrencyLimit", existing?.concurrencyLimit ?? 0),
    tokenQuota: normalizeLimit(source.tokenQuota, "tokenQuota", existing?.tokenQuota ?? 0),
    allowedModels: normalizeAllowedModels(rawModels),
  };
}

function mapPlan(row: any): Plan {
  let allowedModels: string[] = [];
  try {
    const parsed = JSON.parse(String(row.allowed_models || "[]"));
    if (Array.isArray(parsed)) allowedModels = normalizeAllowedModels(parsed);
  } catch {
    allowedModels = [];
  }
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description || ""),
    rpmLimit: Number(row.rpm_limit || 0),
    tpmLimit: Number(row.tpm_limit || 0),
    concurrencyLimit: Number(row.concurrency_limit || 0),
    tokenQuota: Number(row.token_quota || 0),
    allowedModels,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

const PLAN_COLUMNS = "id, name, description, rpm_limit, tpm_limit, concurrency_limit, token_quota, allowed_models, created_at, updated_at";

export function listPlans(): Plan[] {
  return getDatabase().prepare(`SELECT ${PLAN_COLUMNS} FROM plans ORDER BY created_at ASC, name COLLATE NOCASE ASC`)
    .all().map(mapPlan);
}

export function getPlan(id: string): Plan | null {
  const row = getDatabase().prepare(`SELECT ${PLAN_COLUMNS} FROM plans WHERE id = ?`).get(id);
  return row ? mapPlan(row) : null;
}

export function createPlan(input: unknown): Plan {
  const value = normalizePlanInput(input);
  const id = `plan_${randomUUID()}`;
  const now = Date.now();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO plans (id, name, description, rpm_limit, tpm_limit, concurrency_limit, token_quota, allowed_models, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, value.name, value.description, value.rpmLimit, value.tpmLimit, value.concurrencyLimit, value.tokenQuota, JSON.stringify(value.allowedModels), now, now);
  return getPlan(id)!;
}

export function updatePlan(id: string, input: unknown): Plan | null {
  const existing = getPlan(id);
  if (!existing) return null;
  const value = normalizePlanInput(input, existing);
  const result = getDatabase().prepare(`
    UPDATE plans SET name = ?, description = ?, rpm_limit = ?, tpm_limit = ?,
      concurrency_limit = ?, token_quota = ?, allowed_models = ?, updated_at = ?
    WHERE id = ?
  `).run(value.name, value.description, value.rpmLimit, value.tpmLimit, value.concurrencyLimit, value.tokenQuota, JSON.stringify(value.allowedModels), Date.now(), id);
  if (!Number(result.changes || 0)) return null;
  return getPlan(id);
}

export function deletePlan(id: string): { deleted: boolean; assignedKeyCount: number } {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM api_keys WHERE plan_id = ?").get(id)?.count || 0);
    if (count > 0) return { deleted: false, assignedKeyCount: count };
    const result = db.prepare("DELETE FROM plans WHERE id = ?").run(id);
    return { deleted: Number(result.changes || 0) > 0, assignedKeyCount: 0 };
  });
  return transaction();
}

export function planModelAllowed(allowedModels: readonly string[], model: string): boolean {
  if (allowedModels.length === 0) return true;
  return allowedModels.some((pattern) => {
    if (pattern.endsWith("*")) return model.startsWith(pattern.slice(0, -1));
    return model === pattern;
  });
}
