/**
 * AlphaWay Embedded SQLite Database Engine
 *
 * Provides ACID-compliant persistence, WAL mode concurrency, and high-performance
 * indexed queries using native Bun SQLite (bun:sqlite).
 */

import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface CustomProviderRow {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: "openai" | "anthropic";
  models: string[];
  enabled: boolean;
  createdAt?: number;
}

export interface RequestLogRow {
  id: string;
  timestamp: string;
  protocol: "openai" | "anthropic" | "responses";
  model: string;
  provider: "opencode" | "codebuddy" | "custom";
  status: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  savedTokens: number;
  stream: boolean;
}

export function resolveDbDir(): string {
  const customState = process.env.ALPHAWAY_STATE_DIR || process.env.OPENCODE_BRIDGE_STATE_DIR;
  if (customState && customState.trim()) {
    return customState.trim();
  }
  const dir = path.join(os.homedir(), ".alphaway");
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
  return dir;
}

export function getDbFilePath(): string {
  if (process.env.ALPHAWAY_DB_PATH) {
    return process.env.ALPHAWAY_DB_PATH;
  }
  return path.join(resolveDbDir(), "alphaway.sqlite");
}

let dbInstance: any = null;

export function getDatabase(): any {
  if (dbInstance) return dbInstance;

  const dbPath = getDbFilePath();
  const isMemory = dbPath === ":memory:";

  if (!isMemory) {
    const dir = path.dirname(dbPath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }

  // 1. Initialize SQLite Database strictly with native Bun SQLite (bun:sqlite)
  if (typeof (globalThis as any).Bun === "undefined") {
    throw new Error("AlphaWay is purpose-built strictly for Bun. Run with: bun src/index.ts");
  }

  dbInstance = new Database(dbPath);

  // 2. Enable WAL mode for concurrency and optimal I/O throughput
  if (!isMemory) {
    try {
      dbInstance.exec("PRAGMA journal_mode = WAL;");
      dbInstance.exec("PRAGMA synchronous = NORMAL;");
    } catch {}
  }

  // 3. Create Tables
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS custom_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'openai',
      models TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      protocol TEXT NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      status INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      saved_tokens INTEGER NOT NULL,
      stream INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON request_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_requests_model ON request_logs(model);
    CREATE INDEX IF NOT EXISTS idx_requests_provider ON request_logs(provider);
    CREATE INDEX IF NOT EXISTS idx_requests_protocol ON request_logs(protocol);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // 4. Auto-migrate existing JSON files if tables are empty
  autoMigrateJson(dbInstance);

  return dbInstance;
}

/**
 * Resets the database connection (primarily for isolated test suites)
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      if (typeof dbInstance.close === "function") {
        dbInstance.close();
      }
    } catch {}
    dbInstance = null;
  }
}

// ============================================================================
// Custom Providers Queries
// ============================================================================

export function dbLoadCustomProviders(): CustomProviderRow[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM custom_providers ORDER BY created_at ASC").all();
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    apiKey: r.api_key,
    protocol: r.protocol === "anthropic" ? "anthropic" : "openai",
    models: safeParseJson(r.models, ["default-model"]),
    enabled: Boolean(r.enabled),
    createdAt: r.created_at,
  }));
}

export function dbSaveCustomProvider(provider: CustomProviderRow): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO custom_providers (id, name, base_url, api_key, protocol, models, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      base_url = excluded.base_url,
      api_key = excluded.api_key,
      protocol = excluded.protocol,
      models = excluded.models,
      enabled = excluded.enabled,
      created_at = excluded.created_at;
  `);
  stmt.run(
    provider.id,
    provider.name,
    provider.baseUrl,
    provider.apiKey,
    provider.protocol,
    JSON.stringify(provider.models || []),
    provider.enabled ? 1 : 0,
    provider.createdAt || Date.now()
  );
}

export function dbDeleteCustomProvider(id: string): boolean {
  const db = getDatabase();
  const res = db.prepare("DELETE FROM custom_providers WHERE id = ?").run(id);
  return typeof res?.changes === "number" ? res.changes > 0 : true;
}

// ============================================================================
// Request Logs & Analytics Queries
// ============================================================================

export function dbInsertRequestLog(entry: RequestLogRow): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO request_logs (
      id, timestamp, protocol, model, provider, status,
      latency_ms, prompt_tokens, completion_tokens, total_tokens, saved_tokens, stream
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  stmt.run(
    entry.id,
    entry.timestamp,
    entry.protocol,
    entry.model,
    entry.provider,
    entry.status,
    entry.latencyMs,
    entry.promptTokens,
    entry.completionTokens,
    entry.totalTokens,
    entry.savedTokens,
    entry.stream ? 1 : 0
  );
}

export function dbGetRecentRequestLogs(limit: number = 100): RequestLogRow[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM request_logs ORDER BY timestamp DESC LIMIT ?").all(limit);
  return rows.map(mapRequestRow);
}

export function dbGetRequestLogById(id: string): RequestLogRow | null {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM request_logs WHERE id = ?").get(id);
  return row ? mapRequestRow(row) : null;
}

export function dbClearRequestLogs(): void {
  const db = getDatabase();
  db.exec("DELETE FROM request_logs;");
}

export function dbGetSummaryMetrics(): {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  savedTokens: number;
} {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      COUNT(*) as totalRequests,
      SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END) as successfulRequests,
      SUM(CASE WHEN status < 200 OR status >= 300 THEN 1 ELSE 0 END) as failedRequests,
      COALESCE(SUM(prompt_tokens), 0) as totalPromptTokens,
      COALESCE(SUM(completion_tokens), 0) as totalCompletionTokens,
      COALESCE(SUM(total_tokens), 0) as totalTokens,
      COALESCE(SUM(saved_tokens), 0) as savedTokens
    FROM request_logs;
  `).get();

  return {
    totalRequests: row?.totalRequests || 0,
    successfulRequests: row?.successfulRequests || 0,
    failedRequests: row?.failedRequests || 0,
    totalPromptTokens: row?.totalPromptTokens || 0,
    totalCompletionTokens: row?.totalCompletionTokens || 0,
    totalTokens: row?.totalTokens || 0,
    savedTokens: row?.savedTokens || 0,
  };
}

export function dbGetModelSummaries(): Record<string, {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastUsed: string;
}> {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      model,
      COUNT(*) as requests,
      COALESCE(SUM(prompt_tokens), 0) as promptTokens,
      COALESCE(SUM(completion_tokens), 0) as completionTokens,
      COALESCE(SUM(total_tokens), 0) as totalTokens,
      MAX(timestamp) as lastUsed
    FROM request_logs
    GROUP BY model;
  `).all();

  const out: Record<string, any> = {};
  for (const r of rows) {
    out[r.model] = {
      requests: r.requests,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.totalTokens,
      lastUsed: r.lastUsed,
    };
  }
  return out;
}

export function dbGetProviderSummaries(): Record<string, {
  requests: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  lastUsed: string;
}> {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      provider,
      COUNT(*) as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(prompt_tokens), 0) as promptTokens,
      COALESCE(SUM(completion_tokens), 0) as completionTokens,
      MAX(timestamp) as lastUsed
    FROM request_logs
    GROUP BY provider;
  `).all();

  const out: Record<string, any> = {
    opencode: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
    codebuddy: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
    custom: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
  };

  for (const r of rows) {
    out[r.provider] = {
      requests: r.requests,
      tokens: r.tokens,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      lastUsed: r.lastUsed,
    };
  }
  return out;
}

export function dbGetProtocolSummaries(): Record<string, {
  requests: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  lastUsed: string;
}> {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      protocol,
      COUNT(*) as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(prompt_tokens), 0) as promptTokens,
      COALESCE(SUM(completion_tokens), 0) as completionTokens,
      MAX(timestamp) as lastUsed
    FROM request_logs
    GROUP BY protocol;
  `).all();

  const out: Record<string, any> = {
    openai: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
    anthropic: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
    responses: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
  };

  for (const r of rows) {
    out[r.protocol] = {
      requests: r.requests,
      tokens: r.tokens,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      lastUsed: r.lastUsed,
    };
  }
  return out;
}

// ============================================================================
// Settings Key-Value Queries
// ============================================================================

export function dbGetSetting<T>(key: string, defaultValue: T): T {
  const db = getDatabase();
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return defaultValue;
  }
}

export function dbSetSetting<T>(key: string, value: T): void {
  const db = getDatabase();
  const serialized = JSON.stringify(value);
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
  `).run(key, serialized, Date.now());
}

// ============================================================================
// Helpers & Auto-Migration
// ============================================================================

function mapRequestRow(r: any): RequestLogRow {
  return {
    id: r.id,
    timestamp: r.timestamp,
    protocol: r.protocol,
    model: r.model,
    provider: r.provider,
    status: r.status,
    latencyMs: r.latency_ms,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    totalTokens: r.total_tokens,
    savedTokens: r.saved_tokens,
    stream: Boolean(r.stream),
  };
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function autoMigrateJson(db: any): void {
  const dir = resolveDbDir();

  // 1. Migrate custom_providers.json
  try {
    const provCount = db.prepare("SELECT COUNT(*) as count FROM custom_providers").get()?.count || 0;
    if (provCount === 0) {
      const provJsonFile = path.join(dir, "custom_providers.json");
      if (fs.existsSync(provJsonFile)) {
        const raw = fs.readFileSync(provJsonFile, "utf8");
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO custom_providers (id, name, base_url, api_key, protocol, models, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
          `);
          for (const p of list) {
            stmt.run(
              p.id,
              p.name,
              p.baseUrl,
              p.apiKey,
              p.protocol || "openai",
              JSON.stringify(p.models || []),
              p.enabled !== false ? 1 : 0,
              p.createdAt || Date.now()
            );
          }
        }
      }
    }
  } catch {}

  // 2. Migrate usage_stats.json recent logs
  try {
    const reqCount = db.prepare("SELECT COUNT(*) as count FROM request_logs").get()?.count || 0;
    if (reqCount === 0) {
      const usageJsonFile = path.join(dir, "usage_stats.json");
      if (fs.existsSync(usageJsonFile)) {
        const raw = fs.readFileSync(usageJsonFile, "utf8");
        const stats = JSON.parse(raw);
        if (Array.isArray(stats?.recentLogs)) {
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO request_logs (
              id, timestamp, protocol, model, provider, status,
              latency_ms, prompt_tokens, completion_tokens, total_tokens, saved_tokens, stream
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `);
          for (const l of stats.recentLogs) {
            stmt.run(
              l.id,
              l.timestamp,
              l.protocol || "openai",
              l.model || "unknown",
              l.provider || "opencode",
              l.status || 200,
              l.latencyMs || 0,
              l.promptTokens || 0,
              l.completionTokens || 0,
              l.totalTokens || 0,
              l.savedTokens || 0,
              l.stream ? 1 : 0
            );
          }
        }
      }
    }
  } catch {}
}
