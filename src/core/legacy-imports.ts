/**
 * One-time imports from AlphaWay's pre-canonical JSON persistence.
 *
 * Source files are never removed or rewritten. Each successfully parsed source
 * is recorded in legacy_imports in the same transaction as its imported data.
 * INSERT OR IGNORE protects data already saved in SQLite.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type LegacyImportStatus = "imported" | "skipped";

export interface LegacyImportReport {
  sourceKey: string;
  status: LegacyImportStatus | "already-imported" | "already-skipped" | "missing";
  rowCount: number;
  details?: string;
}

interface ImportOutcome {
  status: LegacyImportStatus;
  rowCount: number;
  details?: string;
}

type ImportHandler = (db: any, payload: any) => ImportOutcome;

const MAX_LEGACY_JSON_BYTES = 50 * 1024 * 1024;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function insertAppSettingIfMissing(db: any, key: string, value: unknown): number {
  const result = db.prepare(`
    INSERT OR IGNORE INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
  `).run(key, JSON.stringify(value), Date.now());
  return Number(result.changes || 0);
}

function importCustomProviders(db: any, payload: any): ImportOutcome {
  if (!Array.isArray(payload)) {
    return { status: "skipped", rowCount: 0, details: "Expected a JSON array of providers." };
  }

  const existingCount = Number(
    db.prepare("SELECT COUNT(*) AS count FROM custom_providers").get()?.count || 0
  );
  if (existingCount > 0) {
    return {
      status: "imported",
      rowCount: 0,
      details: "Existing SQLite custom providers were retained; legacy provider mirror was not merged.",
    };
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO custom_providers (
      id, name, base_url, api_key, protocol, models, enabled, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  let invalid = 0;
  for (const provider of payload) {
    if (
      !provider ||
      typeof provider !== "object" ||
      typeof provider.id !== "string" ||
      !provider.id.trim() ||
      typeof provider.name !== "string" ||
      typeof provider.baseUrl !== "string" ||
      typeof provider.apiKey !== "string"
    ) {
      invalid += 1;
      continue;
    }

    const models = Array.isArray(provider.models) ? provider.models : [];
    const result = insert.run(
      provider.id.trim(),
      provider.name,
      provider.baseUrl,
      provider.apiKey,
      provider.protocol === "anthropic" ? "anthropic" : "openai",
      JSON.stringify(models),
      provider.enabled === false ? 0 : 1,
      Number.isFinite(Number(provider.createdAt)) ? Number(provider.createdAt) : Date.now()
    );
    imported += Number(result.changes || 0);
  }

  return {
    status: "imported",
    rowCount: imported,
    details: invalid > 0 ? `Skipped ${invalid} invalid provider row(s).` : undefined,
  };
}

function importUsageStats(db: any, payload: any): ImportOutcome {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { status: "skipped", rowCount: 0, details: "Expected a usage statistics object." };
  }

  const existingSnapshot = db.prepare(
    "SELECT 1 FROM app_settings WHERE key = ?"
  ).get("usage_stats_snapshot");
  if (existingSnapshot) {
    return {
      status: "imported",
      rowCount: 0,
      details: "Existing SQLite usage snapshot was retained; legacy usage mirror was not merged.",
    };
  }

  let rowCount = insertAppSettingIfMissing(db, "usage_stats_snapshot", payload);

  if (Array.isArray(payload.recentLogs)) {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO request_logs (
        id, timestamp, protocol, model, provider, status,
        latency_ms, prompt_tokens, completion_tokens, total_tokens, saved_tokens, stream
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let invalid = 0;
    for (const log of payload.recentLogs) {
      if (!log || typeof log !== "object" || typeof log.timestamp !== "string") {
        invalid += 1;
        continue;
      }

      const promptTokens = Math.max(0, Number(log.promptTokens) || 0);
      const completionTokens = Math.max(0, Number(log.completionTokens) || 0);
      const id = typeof log.id === "string" && log.id.trim()
        ? log.id
        : `legacy_usage_${sha256(JSON.stringify(log)).slice(0, 24)}`;
      const result = insert.run(
        id,
        log.timestamp,
        ["openai", "anthropic", "responses"].includes(log.protocol) ? log.protocol : "openai",
        typeof log.model === "string" && log.model ? log.model : "unknown",
        ["opencode", "codebuddy", "custom"].includes(log.provider) ? log.provider : "opencode",
        Number.isFinite(Number(log.status)) ? Number(log.status) : 200,
        Math.max(0, Number(log.latencyMs) || 0),
        promptTokens,
        completionTokens,
        Math.max(0, Number(log.totalTokens) || (promptTokens + completionTokens)),
        Math.max(0, Number(log.savedTokens) || 0),
        log.stream ? 1 : 0
      );
      rowCount += Number(result.changes || 0);
    }

    if (invalid > 0) {
      return {
        status: "imported",
        rowCount,
        details: `Skipped ${invalid} invalid recent log row(s).`,
      };
    }
  }

  return { status: "imported", rowCount };
}

function importSetting(db: any, key: string): ImportHandler {
  return (database, payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { status: "skipped", rowCount: 0, details: "Expected a JSON object." };
    }
    const inserted = insertAppSettingIfMissing(database, key, payload);
    return {
      status: "imported",
      rowCount: inserted,
      details: inserted === 0 ? "Existing SQLite setting was retained." : undefined,
    };
  };
}

function importSourceFile(
  db: any,
  filePath: string,
  sourceName: string,
  handler: ImportHandler
): LegacyImportReport {
  const sourceKey = `${sourceName}:${path.resolve(filePath)}`;

  if (!fs.existsSync(filePath)) {
    return { sourceKey, status: "missing", rowCount: 0 };
  }

  const prior = db.prepare(
    "SELECT checksum, status, row_count, details FROM legacy_imports WHERE source_key = ?"
  ).get(sourceKey);

  // A completed import is immutable: later JSON edits must not overwrite
  // canonical SQLite state. A previously skipped source may be retried only
  // when its contents changed (for example, an operator repaired invalid JSON).
  if (prior?.status === "imported") {
    return {
      sourceKey,
      status: "already-imported",
      rowCount: Number(prior.row_count || 0),
      details: prior.details || undefined,
    };
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return { sourceKey, status: "missing", rowCount: 0 };
  }

  if (stat.size > MAX_LEGACY_JSON_BYTES) {
    const checksum = sha256(`oversize:${stat.size}:${stat.mtimeMs}`);
    const details = `File exceeds the ${MAX_LEGACY_JSON_BYTES}-byte import limit.`;
    if (prior?.checksum !== checksum || prior?.status !== "skipped") {
      const recordSkipped = db.transaction(() => {
        db.prepare(`
          INSERT INTO legacy_imports (source_key, checksum, status, imported_at, row_count, details)
          VALUES (?, ?, 'skipped', ?, 0, ?)
          ON CONFLICT(source_key) DO UPDATE SET
            checksum = excluded.checksum,
            status = excluded.status,
            imported_at = excluded.imported_at,
            row_count = 0,
            details = excluded.details
        `).run(sourceKey, checksum, new Date().toISOString(), details);
      });
      recordSkipped();
    }
    return {
      sourceKey,
      status: prior?.checksum === checksum && prior?.status === "skipped" ? "already-skipped" : "skipped",
      rowCount: 0,
      details,
    };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const checksum = sha256(raw);
  if (prior?.checksum === checksum) {
    return {
      sourceKey,
      status: prior.status === "skipped" ? "already-skipped" : "already-imported",
      rowCount: Number(prior.row_count || 0),
      details: prior.details || undefined,
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    const details = `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
    const recordSkipped = db.transaction(() => {
      db.prepare(`
        INSERT INTO legacy_imports (source_key, checksum, status, imported_at, row_count, details)
        VALUES (?, ?, 'skipped', ?, 0, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          checksum = excluded.checksum,
          status = excluded.status,
          imported_at = excluded.imported_at,
          row_count = 0,
          details = excluded.details
      `).run(sourceKey, checksum, new Date().toISOString(), details);
    });
    recordSkipped();
    return { sourceKey, status: "skipped", rowCount: 0, details };
  }

  let outcome: ImportOutcome = { status: "skipped", rowCount: 0 };
  const apply = db.transaction(() => {
    outcome = handler(db, payload);
    db.prepare(`
      INSERT INTO legacy_imports (source_key, checksum, status, imported_at, row_count, details)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        checksum = excluded.checksum,
        status = excluded.status,
        imported_at = excluded.imported_at,
        row_count = excluded.row_count,
        details = excluded.details
    `).run(
      sourceKey,
      checksum,
      outcome.status,
      new Date().toISOString(),
      outcome.rowCount,
      outcome.details || null
    );
  });
  apply();

  return { sourceKey, ...outcome };
}

/**
 * Import legacy files from the active state directory and the previous
 * ~/.opencode-free-bridge directory. The active state directory has priority.
 */
export function importLegacyJson(
  db: any,
  stateDir: string,
  legacyDirs: string[] = [path.join(os.homedir(), ".opencode-free-bridge")]
): LegacyImportReport[] {
  const dirs = [...new Set([
    path.resolve(stateDir),
    ...legacyDirs.map((dir) => path.resolve(dir)),
  ])];

  const reports: LegacyImportReport[] = [];
  const sources: Array<{ file: string; name: string; handler: ImportHandler }> = [
    { file: "custom_providers.json", name: "custom_providers", handler: importCustomProviders },
    { file: "usage_stats.json", name: "usage_stats", handler: importUsageStats },
    { file: "tokensaver.json", name: "tokensaver", handler: importSetting("tokensaver_config") },
    { file: "proxy.json", name: "proxy", handler: importSetting("proxy_config") },
  ];

  for (const source of sources) {
    for (const dir of dirs) {
      const report = importSourceFile(
        db,
        path.join(dir, source.file),
        source.name,
        source.handler
      );
      if (report.status !== "missing") reports.push(report);
    }
  }

  return reports;
}
