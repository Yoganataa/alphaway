/**
 * Settings, API Keys & System Diagnostic Route
 */

import { Hono } from "hono";
import fs from "fs";
import { getDatabase, getDbFilePath, dbGetSetting, dbSetSetting } from "../core/database";
import { getConsoleLogs, clearConsoleLogs, pushLog } from "../core/console-buffer";
import { adminRequestError } from "../core/admin-guard";

export const settingsRoute = new Hono();

export interface APIKeyRecord {
  id: string;
  name: string;
  secret: string;
  createdAt: number;
  lastUsedAt?: number;
  requestsCount?: number;
  status: "active" | "revoked";
}

const DEFAULT_KEY: APIKeyRecord = {
  id: "key-default",
  name: "Default Bridge Master Key",
  secret: (process.env.BRIDGE_API_KEY || process.env.API_KEY || "sk-alphaway-free").trim(),
  createdAt: Date.now() - 86400000 * 7,
  status: "active",
};

// GET /api/keys
settingsRoute.get("/api/keys", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  const keys = dbGetSetting<APIKeyRecord[]>("alphaway_api_keys", [DEFAULT_KEY]);
  return c.json({ keys });
});

// POST /api/keys
settingsRoute.post("/api/keys", async (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  const body = await c.req.json().catch(() => ({}));
  const name = (body.name || "API Key").trim();
  const randomSuffix = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  const secret = `sk-aw-${randomSuffix}`;
  const newKey: APIKeyRecord = {
    id: `key-${Date.now()}`,
    name,
    secret,
    createdAt: Date.now(),
    status: "active",
  };

  const keys = dbGetSetting<APIKeyRecord[]>("alphaway_api_keys", [DEFAULT_KEY]);
  keys.unshift(newKey);
  dbSetSetting("alphaway_api_keys", keys);
  pushLog("info", `[Security] Issued new API key '${name}' (${secret.slice(0, 7)}...)`);

  return c.json({ ok: true, key: newKey });
});

// DELETE /api/keys/:id
settingsRoute.delete("/api/keys/:id", (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ error: denied }, 403);

  const id = c.req.param("id");
  const keys = dbGetSetting<APIKeyRecord[]>("alphaway_api_keys", [DEFAULT_KEY]);
  const filtered = keys.filter((k) => k.id !== id);
  dbSetSetting("alphaway_api_keys", filtered);
  pushLog("warn", `[Security] Revoked API key id: ${id}`);

  return c.json({ ok: true, remaining: filtered.length });
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
