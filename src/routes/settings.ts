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
  dbGetManagedKeyUsageWindow,
} from "../core/database";
import { getConsoleLogs, clearConsoleLogs, pushLog } from "../core/console-buffer";
import { adminRequestError, readJsonRequestBody } from "../core/admin-guard";
import { listAPIKeys, issueAPIKey, renameAPIKey, revokeAPIKey, rotateAPIKey, setAPIKeyPolicy } from "../core/api-keys";
import { listPlans, getPlan, createPlan, updatePlan, deletePlan } from "../core/plans";
import {
  listSecurityRules,
  replaceSecurityRules,
  inspectSecurityText,
} from "../core/security-rules";

export const settingsRoute = new Hono();

// GET /api/security/rules
settingsRoute.get("/api/security/rules", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  return c.json({ rules: listSecurityRules() });
});

// PUT /api/security/rules
settingsRoute.put("/api/security/rules", async (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  let body: any;
  try {
    body = await readJsonRequestBody(c.req);
  } catch (error: any) {
    const status = error?.statusCode === 413 ? 413 : 400;
    return c.json({ error: status === 413 ? "Request body exceeds the 10 MiB limit" : "A valid JSON body is required" }, status);
  }

  try {
    const rules = replaceSecurityRules(body?.rules);
    pushLog("info", `[Security] Replaced live Security Rules (${rules.length} rule(s))`);
    return c.json({ ok: true, rules });
  } catch (error: any) {
    return c.json({ error: String(error?.message || "Invalid Security Rules") }, 400);
  }
});

// POST /api/security/inspect
// The Security dashboard uses the same rule engine as live gateway requests.
settingsRoute.post("/api/security/inspect", async (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  let body: any;
  try {
    body = await readJsonRequestBody(c.req);
  } catch (error: any) {
    const status = error?.statusCode === 413 ? 413 : 400;
    return c.json({ error: status === 413 ? "Request body exceeds the 10 MiB limit" : "A valid JSON body is required" }, status);
  }
  if (typeof body?.text !== "string" || body.text.length > 1_000_000) {
    return c.json({ error: "Inspection text must be a string up to 1 MiB" }, 400);
  }

  const result = inspectSecurityText(body.text);
  return c.json({
    ok: true,
    output: result.blocked ? `[BLOCKED_BY_ALPHAWAY: Security rule ${result.blocked.id}]` : result.text,
    blocked: result.blocked,
    maskedRuleIds: result.maskedRuleIds,
  });
});


/** Admin-only reusable Plan policy templates. */
settingsRoute.get("/api/plans", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  return c.json({ plans: listPlans() });
});

settingsRoute.get("/api/plans/:id", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  const plan = getPlan(c.req.param("id"));
  if (!plan) return c.json({ error: "Plan not found" }, 404);
  return c.json({ plan });
});

settingsRoute.post("/api/plans", async (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  let body: any;
  try {
    body = await readJsonRequestBody(c.req);
  } catch (error: any) {
    if (error?.statusCode === 413) return c.json({ error: "Request body exceeds the 10 MiB limit" }, 413);
    return c.json({ error: "A valid JSON object is required" }, 400);
  }
  try {
    const plan = createPlan(body);
    pushLog("info", "[Plans] Created Plan '" + plan.name + "' (" + plan.id + ")");
    return c.json({ ok: true, plan }, 201);
  } catch (error: any) {
    const message = String(error?.message || "Plan creation failed");
    return c.json({ error: message.includes("UNIQUE") ? "A Plan with this name already exists" : message }, 400);
  }
});

settingsRoute.put("/api/plans/:id", async (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  let body: any;
  try {
    body = await readJsonRequestBody(c.req);
  } catch (error: any) {
    if (error?.statusCode === 413) return c.json({ error: "Request body exceeds the 10 MiB limit" }, 413);
    return c.json({ error: "A valid JSON object is required" }, 400);
  }
  try {
    const plan = updatePlan(c.req.param("id"), body);
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    pushLog("info", "[Plans] Updated Plan '" + plan.name + "' (" + plan.id + ")");
    return c.json({ ok: true, plan });
  } catch (error: any) {
    const message = String(error?.message || "Plan update failed");
    return c.json({ error: message.includes("UNIQUE") ? "A Plan with this name already exists" : message }, 400);
  }
});

settingsRoute.delete("/api/plans/:id", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  try {
    const result = deletePlan(c.req.param("id"));
    if (result.assignedKeyCount > 0) {
      return c.json({ error: "Reassign or unassign keys before deleting this Plan", code: "plan_in_use", assignedKeyCount: result.assignedKeyCount }, 409);
    }
    if (!result.deleted) return c.json({ error: "Plan not found" }, 404);
    pushLog("warn", "[Plans] Deleted Plan " + c.req.param("id"));
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Plan deletion failed" }, 500);
  }
});

settingsRoute.patch("/api/keys/:id/policy", async (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);
  let body: any;
  try {
    body = await readJsonRequestBody(c.req);
  } catch (error: any) {
    if (error?.statusCode === 413) return c.json({ error: "Request body exceeds the 10 MiB limit" }, 413);
    return c.json({ error: "A valid JSON object is required" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "A JSON policy object is required" }, 400);
  }
  try {
    const key = setAPIKeyPolicy(c.req.param("id"), body);
    if (!key) return c.json({ error: "Active API key not found" }, 404);
    pushLog("info", "[Security] Updated policy assignment for API key " + key.id);
    return c.json({ ok: true, key });
  } catch (error: any) {
    return c.json({ error: error.message || "API key policy update failed" }, 400);
  }
});

// GET /api/keys/usage?window=1h|24h|7d|30d — persisted per-key usage for a bounded window.
settingsRoute.get("/api/keys/usage", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  const windowName = c.req.query("window") || "24h";
  const durationMs: Record<string, number> = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const duration = durationMs[windowName];
  if (!duration) {
    return c.json({ error: "window must be one of: 1h, 24h, 7d, 30d" }, 400);
  }

  // The SQL range is half-open; add one millisecond so a request logged in
  // the same millisecond as this handler is included in the current window.
  const to = Date.now() + 1;
  const fromIso = new Date(to - duration).toISOString();
  const toIso = new Date(to).toISOString();
  return c.json({
    window: windowName,
    from: fromIso,
    to: toIso,
    items: dbGetManagedKeyUsageWindow(fromIso, toIso),
  });
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
