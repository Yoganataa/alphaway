import type { Migration } from "./types";

/**
 * Adopt the schema used by AlphaWay before versioned migrations existed.
 *
 * Every object is CREATE IF NOT EXISTS so this migration safely initializes
 * an empty database and adopts a legacy database without replacing existing
 * tables or rows.
 */
export const initialSchemaMigration: Migration = {
  version: 1,
  name: "initial-schema",
  up(db) {
    db.exec(`
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

      CREATE TABLE IF NOT EXISTS legacy_imports (
        source_key TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('imported', 'skipped')),
        imported_at TEXT NOT NULL,
        row_count INTEGER NOT NULL DEFAULT 0,
        details TEXT
      );
    `);
  },
};
