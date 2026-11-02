import { getDatabase } from "./database";
import { normalizeAllowedModels, planModelAllowed } from "./plans";

export interface EffectivePolicy {
  keyId: string;
  planId: string | null;
  planName: string | null;
  rpmLimit: number;
  tpmLimit: number;
  concurrencyLimit: number;
  allowedModels: string[];
}

function parseModels(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeAllowedModels(parsed) : [];
  } catch {
    return [];
  }
}

/**
 * Resolve one managed key's effective gateway policy.
 *
 * Precedence is explicit key override -> assigned Plan -> unrestricted (0).
 * NULL means inherit. An explicit numeric 0 means unlimited for that axis.
 * A key allowlist override replaces the Plan allowlist; an empty [] explicitly
 * clears it. This is intentionally different from NULL, which inherits.
 */
export function resolveEffectivePolicy(keyId: string): EffectivePolicy | null {
  if (!keyId) return null;
  const row = getDatabase().prepare(`
    SELECT
      k.id,
      k.plan_id,
      k.rate_limit_rpm,
      k.rate_limit_tpm,
      k.concurrency_limit AS key_concurrency_limit,
      k.allowed_models AS key_allowed_models,
      p.name AS plan_name,
      p.rpm_limit AS plan_rpm_limit,
      p.tpm_limit AS plan_tpm_limit,
      p.concurrency_limit AS plan_concurrency_limit,
      p.allowed_models AS plan_allowed_models
    FROM api_keys k
    LEFT JOIN plans p ON p.id = k.plan_id
    WHERE k.id = ? AND k.status = 'active'
  `).get(keyId);
  if (!row) return null;

  const chooseLimit = (override: unknown, inherited: unknown): number => {
    if (override !== null && override !== undefined) return Number(override);
    return Number(inherited || 0);
  };
  const allowedModels = row.key_allowed_models !== null && row.key_allowed_models !== undefined
    ? parseModels(row.key_allowed_models)
    : parseModels(row.plan_allowed_models);

  return {
    keyId: String(row.id),
    planId: row.plan_id == null ? null : String(row.plan_id),
    planName: row.plan_name == null ? null : String(row.plan_name),
    rpmLimit: chooseLimit(row.rate_limit_rpm, row.plan_rpm_limit),
    tpmLimit: chooseLimit(row.rate_limit_tpm, row.plan_tpm_limit),
    concurrencyLimit: chooseLimit(row.key_concurrency_limit, row.plan_concurrency_limit),
    allowedModels,
  };
}

export function isModelAllowedByPolicy(policy: EffectivePolicy, model: string): boolean {
  return planModelAllowed(policy.allowedModels, model);
}
