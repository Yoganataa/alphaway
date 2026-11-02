/**
 * Settings, API Keys & System Diagnostic Route
 */

import { Hono } from "hono";
import path from "node:path";
import { createMigrationBackup } from "../core/migrations/backup";
import {
  getDatabase,
  getDbFilePath,
  getDatabaseStorageStats,
  vacuumDatabase,
  dbGetSetting,
  dbSetSetting,
} from "../core/database";
import { getConsoleLogs, clearConsoleLogs, pushLog } from "../core/console-buffer";
import { adminRequestError, readJsonRequestBody } from "../core/admin-guard";
import { listAPIKeys, issueAPIKey, renameAPIKey, revokeAPIKey, rotateAPIKey } from "../core/api-keys";

export const settingsRoute = new Hono();

export interface SecurityKeywordRule {
  id: string;
  pattern: string;
  action: "mask" | "block";
  description: string;
  enabled: boolean;
}

const DEFAULT_SECURITY_RULES: SecurityKeywordRule[] = [
  {
    id: "rule-1",
    pattern: "browser_cookies_db",
    action: "block",
    description: "Anti-Infostealer: Protect browser cookies and login databases",
    enabled: true,
  },
  {
    id: "rule-2",
    pattern: "dpapi_masterkey",
    action: "block",
    description: "Anti-Infostealer: Protect Windows DPAPI credentials and vault",
    enabled: true,
  },
  {
    id: "rule-3",
    pattern: "keychain_access",
    action: "block",
    description: "Anti-Infostealer: Protect macOS Keychain database",
    enabled: true,
  },
  {
    id: "rule-4",
    pattern: "openai_secret_token",
    action: "mask",
    description: "DLP: Redact provider API keys before forwarding",
    enabled: true,
  },
  {
    id: "rule-5",
    pattern: "aws_credentials",
    action: "mask",
    description: "DLP: Redact AWS access keys and session secrets",
    enabled: true,
  },
];

function validateSecurityRules(input: unknown): SecurityKeywordRule[] | null {
  if (!Array.isArray(input) || input.length > 100) return null;

  const ids = new Set<string>();
  const rules: SecurityKeywordRule[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const value = item as Record<string, unknown>;
    if (
      typeof value.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(value.id) ||
      ids.has(value.id) ||
      typeof value.pattern !== "string" ||
      !value.pattern.trim() ||
      value.pattern.trim().length > 128 ||
      (value.action !== "mask" && value.action !== "block") ||
      typeof value.description !== "string" ||
      value.description.length > 256 ||
      typeof value.enabled !== "boolean"
    ) {
      return null;
    }

    ids.add(value.id);
    rules.push({
      id: value.id,
      pattern: value.pattern.trim(),
      action: value.action,
      description: value.description.trim(),
      enabled: value.enabled,
    });
  }
  return rules;
}

// GET /api/security/rules
settingsRoute.get("/api/security/rules", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  const rules = dbGetSetting<SecurityKeywordRule[]>(
    "security_rules",
    DEFAULT_SECURITY_RULES
  );
  return c.json({ rules });
});

// PUT /api/security/rules
settingsRoute.put("/api/security/rules", async (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  let body: any = null;
  try {
    body = await readJsonRequestBody(c.req);
  } catch (error: any) {
    if (error?.statusCode === 413) return c.json({ error: "Request body exceeds the 10 MiB limit" }, 413);
  }
  const rules = validateSecurityRules(body?.rules);
  if (!rules) {
    return c.json(
      { error: "Invalid security rules. Provide up to 100 unique rules with valid IDs, patterns, actions, descriptions, and enabled flags." },
      400
    );
  }

  dbSetSetting("security_rules", rules);
  pushLog("info", `[Security] Persisted ${rules.length} custom DLP rule(s)`);
  return c.json({ ok: true, rules });
});

// GET /api/keys — metadata only; the raw secret is never stored or returned.
settingsRoute.get("/api/keys", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  return c.json({ keys: listAPIKeys() });
});

// POST /api/keys — return the generated secret exactly once.
settingsRoute.post("/api/keys", async (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  let body: any = null;
  try {
    body = await readJsonRequestBody(c.req);
  } catch (error: any) {
    if (error?.statusCode === 413) return c.json({ error: "Request body exceeds the 10 MiB limit" }, 413);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "A JSON object is required" }, 400);
  }
  try {
    const issued = issueAPIKey(typeof body.name === "string" ? body.name : "API Key");
    pushLog("info", `[Security] Issued API key '${issued.record.name}' (${issued.record.prefix}…)`);
    return c.json({ ok: true, key: { ...issued.record, secret: issued.secret } }, 201);
  } catch (error: any) {
    return c.json({ error: error.message || "API key creation failed" }, 400);
  }
});

// PATCH /api/keys/:id — change the operator-facing label.
settingsRoute.patch("/api/keys/:id", async (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  let body: any = null;
  try {
    body = await readJsonRequestBody(c.req);
  } catch (error: any) {
    if (error?.statusCode === 413) return c.json({ error: "Request body exceeds the 10 MiB limit" }, 413);
  }
  if (!body || typeof body.name !== "string") return c.json({ error: "A key name is required" }, 400);
  try {
    const key = renameAPIKey(c.req.param("id"), body.name);
    if (!key) return c.json({ error: "Active API key not found" }, 404);
    return c.json({ ok: true, key });
  } catch (error: any) {
    return c.json({ error: error.message || "API key update failed" }, 400);
  }
});

// POST /api/keys/:id/rotate — atomically replace the secret; old credentials stop working.
settingsRoute.post("/api/keys/:id/rotate", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  try {
    const issued = rotateAPIKey(c.req.param("id"));
    if (!issued) return c.json({ error: "Active API key not found" }, 404);
    pushLog("warn", `[Security] Rotated API key id: ${issued.record.id}`);
    return c.json({ ok: true, key: { ...issued.record, secret: issued.secret } });
  } catch (error: any) {
    return c.json({ error: error.message || "API key rotation failed" }, 500);
  }
});

// DELETE /api/keys/:id — revocation is durable and immediately invalidates requests.
settingsRoute.delete("/api/keys/:id", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  const id = c.req.param("id");
  const revoked = revokeAPIKey(id);
  if (!revoked) return c.json({ error: "Active API key not found" }, 404);
  pushLog("warn", `[Security] Revoked API key id: ${id}`);
  return c.json({ ok: true });
});

// GET /api/console-logs
settingsRoute.get("/api/console-logs", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  return c.json({ logs: getConsoleLogs() });
});

// POST /api/console-logs/clear
settingsRoute.post("/api/console-logs/clear", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  clearConsoleLogs();
  pushLog("info", "[Console] Log buffer cleared by operator");
  return c.json({ ok: true });
});

// Download an encrypted, SQLite-aware physical snapshot. This is deliberately
// not a JSON settings export; it contains the complete AlphaWay SQLite database.
settingsRoute.get("/api/settings/database/backup", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  try {
    const backupPath = createMigrationBackup(getDatabase(), getDbFilePath(), "operator-manual");
    const backupFile = Bun.file(backupPath);
    pushLog("info", "[Database] Created encrypted physical SQLite backup");
    return c.body(backupFile.stream(), 200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${path.basename(backupPath)}"`,
      "Content-Length": String(backupFile.size),
      "Cache-Control": "no-store",
    });
  } catch (error: any) {
    pushLog("error", "[Database] Could not create encrypted SQLite backup: " + (error?.message || String(error)));
    return c.json({ ok: false, error: error?.message || "Could not create SQLite backup" }, 500);
  }
});

// Database diagnostics use the same stats/vacuum route contract as 9router-go.
// Keep the original GET path for existing AlphaWay dashboard builds.
function databaseStatsResponse(c: any) {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  try {
    const stats = getDatabaseStorageStats();
    const db = getDatabase();
    const journal = db.query("PRAGMA journal_mode;").get() as { journal_mode?: string };
    const busyTimeout = db.query("PRAGMA busy_timeout;").get() as { timeout?: number; busy_timeout?: number };
    return c.json({
      engine: "Bun SQLite (native)",
      mode: String(journal?.journal_mode || "").toUpperCase() === "WAL" ? "WAL (Write-Ahead Logging)" : String(journal?.journal_mode || "unknown"),
      path: stats.path,
      sizeKb: Math.round(stats.databaseSizeBytes / 1024),
      ...stats,
      journalMode: journal?.journal_mode || "unknown",
      busyTimeoutMs: Number(busyTimeout?.timeout ?? busyTimeout?.busy_timeout ?? 5000),
    });
  } catch (error: any) {
    return c.json({ error: error?.message || "Could not read SQLite database statistics" }, 500);
  }
}

settingsRoute.get("/api/settings/database", databaseStatsResponse);
settingsRoute.get("/api/settings/database/stats", databaseStatsResponse);

// POST /api/settings/database/vacuum
settingsRoute.post("/api/settings/database/vacuum", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  try {
    const stats = vacuumDatabase();
    pushLog("info", "[Database] SQLite WAL checkpoint and VACUUM completed successfully");
    return c.json({
      ok: true,
      message: "Database vacuumed and indexes optimized.",
      ...stats,
    });
  } catch (error: any) {
    return c.json({ ok: false, error: error?.message || "Database vacuum failed" }, 500);
  }
});
