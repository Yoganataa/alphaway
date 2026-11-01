/**
 * Settings, API Keys & System Diagnostic Route
 */

import { Hono } from "hono";
import fs from "fs";
import { getDatabase, getDbFilePath, dbGetSetting, dbSetSetting } from "../core/database";
import { getConsoleLogs, clearConsoleLogs, pushLog } from "../core/console-buffer";
import { adminRequestError } from "../core/admin-guard";
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

  const body = await c.req.json().catch(() => null);
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
  const body = await c.req.json().catch(() => null);
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
  const body = await c.req.json().catch(() => null);
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

// GET /api/settings/database
settingsRoute.get("/api/settings/database", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  const dbPath = getDbFilePath();
  let fileSizeKb = 0;
  if (fs.existsSync(dbPath)) {
    try {
      fileSizeKb = Math.round(fs.statSync(dbPath).size / 1024);
    } catch {}
  }

  const db = getDatabase();
  let requestLogsCount = 0;
  let customProvidersCount = 0;
  try {
    requestLogsCount = db.prepare("SELECT COUNT(*) as count FROM request_logs").get()?.count || 0;
    customProvidersCount = db.prepare("SELECT COUNT(*) as count FROM custom_providers").get()?.count || 0;
  } catch {}

  return c.json({
    engine: "Bun SQLite (native)",
    mode: "WAL (Write-Ahead Logging)",
    path: dbPath,
    sizeKb: fileSizeKb,
    requestLogsCount,
    customProvidersCount,
  });
});

// POST /api/settings/database/vacuum
settingsRoute.post("/api/settings/database/vacuum", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  const db = getDatabase();
  try {
    db.exec("VACUUM;");
    pushLog("info", "[Database] SQLite VACUUM executed successfully");
    return c.json({ ok: true, message: "Database vacuumed and indexes optimized." });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});
