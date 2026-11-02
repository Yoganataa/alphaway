/**
 * AlphaWay Embedded SQLite Database Engine
 *
 * Provides ACID-compliant persistence, WAL mode concurrency, and high-performance
 * indexed queries using native Bun SQLite (bun:sqlite).
 */

import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "./migrations";
import { createMigrationBackup, encryptExistingMigrationBackups } from "./migrations/backup";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "./secrets";
import { hasEmbeddedProviderUrlSecrets } from "./provider-url-secrets";
import {
  ensurePrivateDirectory,
  resolveDataDir,
  resolveDatabasePath,
} from "./storage-paths";

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
  clientApiKeyId?: string | null;
}

/** @deprecated Use resolveDataDir; retained for existing internal callers. */
export function resolveDbDir(): string {
  return resolveDataDir();
}

export function getDbFilePath(): string {
  return resolveDatabasePath();
}

let dbInstance: any = null;

/**
 * Remove pre-encryption credential remnants from SQLite free pages and WAL.
 * This runs once after migration v2; a pending marker makes an interrupted
 * cleanup retry safely on the next startup. This is logical database cleanup,
 * not a guarantee against filesystem snapshots or physical-media remanence.
 */
function scrubLegacySecretResidue(db: any): void {
  const marker = db.prepare(
    "SELECT value FROM app_settings WHERE key = ?"
  ).get("alpha_security_secret_scrub") as { value: string } | undefined;
  if (marker?.value !== JSON.stringify("pending")) return;

  const checkpoint = () => {
    const result = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as any;
    const busy = Number(result?.busy ?? result?.[0] ?? 0);
    if (busy !== 0) {
      throw new Error("SQLite WAL checkpoint was busy; secret cleanup cannot proceed safely");
    }
  };

  checkpoint();
  db.exec("VACUUM;");
  checkpoint();
  db.prepare(
    "UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?"
  ).run(JSON.stringify("complete"), Date.now(), "alpha_security_secret_scrub");
  checkpoint();
}


export interface DatabaseStorageStats {
  path: string;
  databaseSizeBytes: number;
  reclaimableBytes: number;
  walSizeBytes: number;
  pageCount: number;
  pageSize: number;
  freelistCount: number;
  requestLogsCount: number;
  customProvidersCount: number;
}

export function getDatabaseStorageStats(): DatabaseStorageStats {
  const db = getDatabase();
  const pageCount = Number(db.query("PRAGMA page_count;").get()?.page_count || 0);
  const pageSize = Number(db.query("PRAGMA page_size;").get()?.page_size || 0);
  const freelistCount = Number(db.query("PRAGMA freelist_count;").get()?.freelist_count || 0);
  const requestLogsCount = Number(db.query("SELECT COUNT(*) AS count FROM request_logs;").get()?.count || 0);
  const customProvidersCount = Number(db.query("SELECT COUNT(*) AS count FROM custom_providers;").get()?.count || 0);
  const dbPath = getDbFilePath();
  let walSizeBytes = 0;
  try { walSizeBytes = fs.statSync(dbPath + "-wal").size; } catch {}
  return {
    path: dbPath,
    databaseSizeBytes: pageCount * pageSize,
    reclaimableBytes: freelistCount * pageSize,
    walSizeBytes,
    pageCount,
    pageSize,
    freelistCount,
    requestLogsCount,
    customProvidersCount,
  };
}

/** Compact the live WAL-backed database and release free pages to the OS. */
export function vacuumDatabase(): DatabaseStorageStats {
  const db = getDatabase();
  const before = db.query("PRAGMA wal_checkpoint(TRUNCATE);").get() as { busy?: number };
  if (Number(before?.busy || 0) !== 0) {
    throw new Error("SQLite WAL checkpoint is busy; stop other database readers/writers and retry");
  }
  db.exec("VACUUM;");
  const after = db.query("PRAGMA wal_checkpoint(TRUNCATE);").get() as { busy?: number };
  if (Number(after?.busy || 0) !== 0) {
    throw new Error("SQLite WAL checkpoint remained busy after VACUUM");
  }
  return getDatabaseStorageStats();
}

export function getDatabase(): any {
  if (dbInstance) return dbInstance;

  const dbPath = getDbFilePath();
  const isMemory = dbPath === ":memory:";

  if (!isMemory) {
    const dir = path.dirname(dbPath);
    try {
      ensurePrivateDirectory(dir);
      // Convert historical plaintext SQLite migration/pre-restore snapshots
      // before the application serves requests or exposes backup diagnostics.
      encryptExistingMigrationBackups(path.join(dir, "backups"));
      encryptExistingMigrationBackups(dir, path.basename(dbPath));
    } catch (error) {
      throw new Error("Could not secure the SQLite data directory or its backups: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  // 1. Initialize SQLite Database strictly with native Bun SQLite (bun:sqlite)
  if (typeof (globalThis as any).Bun === "undefined") {
    throw new Error("AlphaWay is purpose-built strictly for Bun. Run with: bun src/index.ts");
  }

  dbInstance = new Database(dbPath);
  try {
    if (!isMemory && process.platform !== "win32") {
      fs.chmodSync(dbPath, 0o600);
    }

    // Match 9router-go's SQLite connection contract. Bun owns one synchronous
    // connection per Database instance; these PRAGMAs apply to its operations.
    dbInstance.exec("PRAGMA busy_timeout = 5000;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");
    dbInstance.exec("PRAGMA synchronous = NORMAL;");
    dbInstance.exec("PRAGMA temp_store = MEMORY;");
    dbInstance.exec("PRAGMA cache_size = -8000;");
    if (!isMemory) {
      dbInstance.exec("PRAGMA mmap_size = 30000000;");
      dbInstance.exec("PRAGMA journal_mode = WAL;");
      const journalMode = dbInstance.query("PRAGMA journal_mode;").get() as { journal_mode?: string };
      if (String(journalMode?.journal_mode || "").toLowerCase() !== "wal") {
        throw new Error("SQLite could not enable WAL journal mode");
      }
    }
  } catch (error) {
    try { dbInstance.close(); } catch {}
    dbInstance = null;
    throw new Error("Could not initialize the SQLite database safely: " + (error instanceof Error ? error.message : String(error)));
  }

  // 3. Apply versioned, transactional schema migrations. Existing tables are
  // adopted by the initial CREATE IF NOT EXISTS migration; existing rows stay
  // intact. A failed migration aborts startup instead of silently booting with
  // a partially upgraded schema.
  try {
    // secure_delete is connection-local; keep it enabled for future credential
    // updates/deletes as well as the initial v2 migration.
    dbInstance.exec("PRAGMA secure_delete = ON;");

    const migrationResult = runMigrations(dbInstance, undefined, {
      beforeDestructiveMigration: (migration) => {
        const backupPath = createMigrationBackup(dbInstance, dbPath, migration.name);
        console.warn(`[AlphaWay] Created pre-migration backup: ${backupPath}`);
      },
    });
    if (!isMemory) scrubLegacySecretResidue(dbInstance);

    if (migrationResult.applied.length > 0) {
      console.info(
        `[AlphaWay] SQLite schema migrated to v${migrationResult.currentVersion} (${migrationResult.applied.length} migration(s))`
      );
    }
  } catch (error) {
    try { dbInstance.close(); } catch {}
    dbInstance = null;
    throw error;
  }

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
  const migrateKey = db.prepare("UPDATE custom_providers SET api_key = ? WHERE id = ?");
  const migrateBaseUrl = db.prepare("UPDATE custom_providers SET base_url = ? WHERE id = ?");

  return rows.map((r: any) => {
    let baseUrl = String(r.base_url || "");
    if (isEncryptedSecret(baseUrl)) {
      baseUrl = decryptSecret(baseUrl);
    } else if (hasEmbeddedProviderUrlSecrets(baseUrl)) {
      // Legacy records may have credentials embedded in base URLs. Encrypt the
      // original URL before exposing it to internal provider dispatch.
      const encryptedBaseUrl = encryptSecret(baseUrl);
      migrateBaseUrl.run(encryptedBaseUrl, r.id);
      baseUrl = decryptSecret(encryptedBaseUrl);
    }

    let apiKey = String(r.api_key || "");
    if (apiKey.includes("xxxxxxxx")) {
      if (apiKey) migrateKey.run("", r.id);
      apiKey = "";
    } else if (apiKey && !isEncryptedSecret(apiKey)) {
      // Defensive lazy upgrade for rows written by older importers or tools.
      apiKey = encryptSecret(apiKey);
      migrateKey.run(apiKey, r.id);
      apiKey = decryptSecret(apiKey);
    } else if (isEncryptedSecret(apiKey)) {
      apiKey = decryptSecret(apiKey);
    }

    return {
      id: r.id,
      name: r.name,
      baseUrl,
      apiKey,
      protocol: r.protocol === "anthropic" ? "anthropic" : "openai",
      models: safeParseJson(r.models, ["default-model"]),
      enabled: Boolean(r.enabled),
      createdAt: r.created_at,
    };
  });
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
    hasEmbeddedProviderUrlSecrets(provider.baseUrl) ? encryptSecret(provider.baseUrl) : provider.baseUrl,
    encryptSecret(String(provider.apiKey || "").includes("xxxxxxxx") ? "" : provider.apiKey),
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
      latency_ms, prompt_tokens, completion_tokens, total_tokens, saved_tokens, stream, client_api_key_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
    entry.stream ? 1 : 0,
    entry.clientApiKeyId ?? null
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

export function dbGetDailyUsageHistory(): Record<string, { requests: number; tokens: number }> {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      substr(timestamp, 1, 10) AS date,
      COUNT(*) AS requests,
      COALESCE(SUM(total_tokens), 0) AS tokens
    FROM request_logs
    GROUP BY substr(timestamp, 1, 10)
    ORDER BY date ASC
  `).all();

  const history: Record<string, { requests: number; tokens: number }> = {};
  for (const row of rows) {
    history[row.date] = { requests: row.requests, tokens: row.tokens };
  }
  return history;
}

export function dbGetHourlyUsageHistory(): Record<string, { tokens: number; cost: number; byModel: Record<string, number> }> {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      substr(timestamp, 1, 13) || ':00' AS hour,
      model,
      COALESCE(SUM(total_tokens), 0) AS tokens,
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM request_logs
    GROUP BY substr(timestamp, 1, 13), model
    ORDER BY hour ASC
  `).all();

  const history: Record<string, { tokens: number; cost: number; byModel: Record<string, number> }> = {};
  for (const row of rows) {
    const bucket = history[row.hour] ||= { tokens: 0, cost: 0, byModel: {} };
    bucket.tokens += Number(row.tokens || 0);
    bucket.cost += (Number(row.prompt_tokens || 0) / 1_000_000) * 2.5 +
      (Number(row.completion_tokens || 0) / 1_000_000) * 10;
    bucket.byModel[row.model] = (bucket.byModel[row.model] || 0) + Number(row.tokens || 0);
  }
  return history;
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

export function dbDeleteSetting(key: string): boolean {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
  return Number(result.changes || 0) > 0;
}

/**
 * Atomically persist one request event and the matching aggregate snapshot.
 * This prevents a crash between the event insert and summary persistence from
 * leaving usage analytics permanently behind the request log.
 */
export function dbInsertRequestLogWithSnapshot(entry: RequestLogRow, snapshot: unknown): void {
  const db = getDatabase();
  const insert = db.prepare(`
    INSERT INTO request_logs (
      id, timestamp, protocol, model, provider, status,
      latency_ms, prompt_tokens, completion_tokens, total_tokens, saved_tokens, stream, client_api_key_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsert = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('usage_stats_snapshot', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const persist = db.transaction(() => {
    insert.run(
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
      entry.stream ? 1 : 0,
      entry.clientApiKeyId ?? null
    );
    if (entry.clientApiKeyId) {
      db.prepare("UPDATE api_keys SET total_tokens_used = total_tokens_used + ? WHERE id = ? AND status = ?")
        .run(Math.max(0, Number(entry.totalTokens) || 0), entry.clientApiKeyId, "active");
    }
    upsert.run(JSON.stringify(snapshot), Date.now());
  });
  persist();
}

/** Atomically clear request detail rows and save the new aggregate snapshot. */
export function dbClearRequestLogsWithSnapshot(snapshot: unknown): void {
  const db = getDatabase();
  const upsert = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('usage_stats_snapshot', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const persist = db.transaction(() => {
    db.exec("DELETE FROM request_logs");
    upsert.run(JSON.stringify(snapshot), Date.now());
  });
  persist();
}


// ============================================================================
// Helpers
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
    clientApiKeyId: r.client_api_key_id == null ? null : String(r.client_api_key_id),
  };
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
