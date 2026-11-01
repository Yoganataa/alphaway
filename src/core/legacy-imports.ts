/**
 * One-time imports from AlphaWay's pre-canonical JSON persistence.
 *
 * Legacy source files are imported into canonical SQLite state, then replaced
 * atomically with AES-256-GCM rollback envelopes. The import ledger prevents
 * encrypted backups from being re-imported as JSON.
 */

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "./secrets";
import { hasEmbeddedProviderUrlSecrets } from "./provider-url-secrets";

type LegacyImportStatus = "imported" | "skipped";

export interface LegacyImportReport {
  sourceKey: string;
  status: LegacyImportStatus | "already-imported" | "missing";
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
      hasEmbeddedProviderUrlSecrets(provider.baseUrl)
        ? encryptSecret(provider.baseUrl)
        : provider.baseUrl,
      encryptSecret(provider.apiKey.includes("xxxxxxxx") ? "" : provider.apiKey),
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

function importProxyConfig(db: any, payload: any): ImportOutcome {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { status: "skipped", rowCount: 0, details: "Expected a proxy configuration object." };
  }

  const config = { ...payload };
  if (typeof config.url === "string") config.url = encryptSecret(config.url);
  if (Array.isArray(config.pool)) {
    config.pool = config.pool.map((entry: any) => {
      if (typeof entry === "string") return encryptSecret(entry);
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const safe = { ...entry };
      for (const field of ["url", "token", "auth"]) {
        if (typeof safe[field] === "string") safe[field] = encryptSecret(safe[field]);
      }
      return safe;
    });
  }

  const inserted = insertAppSettingIfMissing(db, "proxy_config", config);
  return {
    status: "imported",
    rowCount: inserted,
    details: inserted === 0 ? "Existing SQLite setting was retained." : undefined,
  };
}
function importSetting(key: string): ImportHandler {
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

function secureLegacyBackup(filePath: string, plaintext: string, expectedChecksum: string, expectedStat?: fs.Stats): boolean {
  const noFollow = process.platform === "win32" ? 0 : (fs.constants.O_NOFOLLOW || 0);
  try {
    const pathStat = fs.lstatSync(filePath);
    if (pathStat.isSymbolicLink() || !pathStat.isFile()) return false;
    const sourceFd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
    let current: string;
    try {
      const currentStat = fs.fstatSync(sourceFd);
      if (currentStat.dev !== pathStat.dev || currentStat.ino !== pathStat.ino) return false;
      if (expectedStat && (currentStat.dev !== expectedStat.dev || currentStat.ino !== expectedStat.ino)) return false;
      if (process.platform !== "win32") fs.fchmodSync(sourceFd, 0o600);
      current = fs.readFileSync(sourceFd, "utf8");
    } finally {
      fs.closeSync(sourceFd);
    }
    if (sha256(current) !== expectedChecksum) return false;
  } catch {
    return false;
  }

  const encrypted = encryptSecret(plaintext);
  const tempPath = path.join(path.dirname(filePath), "." + path.basename(filePath) + "." + randomUUID() + ".tmp");
  try {
    const fd = fs.openSync(tempPath, "wx", 0o600);
    try {
      fs.writeFileSync(fd, encrypted, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    const latestPathStat = fs.lstatSync(filePath);
    if (latestPathStat.isSymbolicLink() || !latestPathStat.isFile()) return false;
    if (expectedStat && (latestPathStat.dev !== expectedStat.dev || latestPathStat.ino !== expectedStat.ino)) return false;
    const verifyFd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
    let latestContents: string;
    try {
      const latestStat = fs.fstatSync(verifyFd);
      if (latestStat.dev !== latestPathStat.dev || latestStat.ino !== latestPathStat.ino) return false;
      latestContents = fs.readFileSync(verifyFd, "utf8");
    } finally {
      fs.closeSync(verifyFd);
    }
    if (sha256(latestContents) !== expectedChecksum) return false;

    fs.renameSync(tempPath, filePath);
    if (process.platform !== "win32") {
      try { fs.chmodSync(filePath, 0o600); } catch {}
    }
    try {
      const dirFd = fs.openSync(path.dirname(filePath), "r");
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    } catch {}
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}
/** Restore an encrypted legacy JSON rollback copy without overwriting an existing file. */
export function restoreLegacyBackup(encryptedPath: string, outputPath: string): void {
  const source = path.resolve(encryptedPath);
  const destination = path.resolve(outputPath);
  if (source === destination) throw new Error("Restore output must be a different file");
  const noFollow = process.platform === "win32" ? 0 : (fs.constants.O_NOFOLLOW || 0);
  const sourcePathStat = fs.lstatSync(source);\n  if (sourcePathStat.isSymbolicLink() || !sourcePathStat.isFile()) throw new Error("Encrypted backup source must be a regular, non-symlink file");\n  const sourceFd = fs.openSync(source, fs.constants.O_RDONLY | noFollow);
  let envelope: string;
  try {
    const sourceStat = fs.fstatSync(sourceFd);
    if (!sourceStat.isFile() || sourceStat.dev !== sourcePathStat.dev || sourceStat.ino !== sourcePathStat.ino) throw new Error("Encrypted backup source changed while it was being opened");
    const maxEncryptedBytes = Math.ceil(MAX_LEGACY_JSON_BYTES * 4 / 3) + 4096;
    if (sourceStat.size > maxEncryptedBytes) throw new Error("Encrypted backup exceeds the restore size limit");
    envelope = fs.readFileSync(sourceFd, "utf8").trim();
  } finally {
    fs.closeSync(sourceFd);
  }
  if (!isEncryptedSecret(envelope)) throw new Error("File is not an AlphaWay encrypted legacy backup");
  const plaintext = decryptSecret(envelope);
  if (Buffer.byteLength(plaintext, "utf8") > MAX_LEGACY_JSON_BYTES) throw new Error("Restored JSON exceeds the legacy import size limit");
  if (path.extname(destination).toLowerCase() !== ".json") throw new Error("Restore output must use a .json extension");
  const outputDir = path.dirname(destination);
  const outputStat = fs.lstatSync(outputDir);
  if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) throw new Error("Restore output directory must be a regular directory");
  const fd = fs.openSync(destination, "wx", 0o600);
  try { fs.writeFileSync(fd, plaintext, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (process.platform !== "win32") { try { fs.chmodSync(destination, 0o600); } catch {} }
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

  // Completed imports are immutable. If an older build left the original JSON
  // source in plaintext, secure it after checking its ledger entry below.
  let sourceFd: number;
  let stat: fs.Stats;
  try {
    const pathStat = fs.lstatSync(filePath);
    if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
      return { sourceKey, status: "skipped", rowCount: 0, details: "Only regular, non-symlink legacy JSON files can be imported." };
    }
    const noFollow = process.platform === "win32" ? 0 : (fs.constants.O_NOFOLLOW || 0);
    sourceFd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
    stat = fs.fstatSync(sourceFd);
    if (stat.dev !== pathStat.dev || stat.ino !== pathStat.ino) {
      fs.closeSync(sourceFd);
      return { sourceKey, status: "skipped", rowCount: 0, details: "Legacy source changed while it was being opened." };
    }
  } catch (error: any) {
    if (error?.code === "ENOENT") return { sourceKey, status: "missing", rowCount: 0 };
    return {
      sourceKey,
      status: "skipped",
      rowCount: 0,
      details: error?.code === "ELOOP"
        ? "Symlinked legacy JSON sources are not imported."
        : `Could not safely open the legacy source: ${error?.code || "I/O error"}.`,
    };
  }

  let raw: string;
  try {
    if (!stat.isFile()) {
      return { sourceKey, status: "skipped", rowCount: 0, details: "Only regular legacy JSON files can be imported." };
    }
    if (process.platform !== "win32") fs.fchmodSync(sourceFd, 0o600);
    if (stat.size > MAX_LEGACY_JSON_BYTES) {
      return {
        sourceKey,
        status: "skipped",
        rowCount: 0,
        details: `File exceeds the ${MAX_LEGACY_JSON_BYTES}-byte import limit.`,
      };
    }
    raw = fs.readFileSync(sourceFd, "utf8");
  } finally {
    fs.closeSync(sourceFd);
  }
  if (prior?.status === "imported") {
    if (!isEncryptedSecret(raw.trim())) {
      const secured = secureLegacyBackup(filePath, raw, sha256(raw), stat);
      const details = secured
        ? "Canonical SQLite data retained; legacy rollback copy encrypted in place."
        : "Canonical SQLite data retained; legacy source changed during backup and remains owner-restricted plaintext."; 
      db.prepare("UPDATE legacy_imports SET details = ? WHERE source_key = ?").run(details, sourceKey);
      return { sourceKey, status: "already-imported", rowCount: Number(prior.row_count || 0), details };
    }
    return { sourceKey, status: "already-imported", rowCount: Number(prior.row_count || 0), details: prior.details || undefined };
  }
  if (isEncryptedSecret(raw.trim())) {
    return { sourceKey, status: "skipped", rowCount: 0, details: "Encrypted rollback copy is not a plaintext import source; use --restore-legacy-backup to restore it." };
  }
  const checksum = sha256(raw);
  if (prior?.checksum === checksum) {
    let details = prior.details || undefined;
    if (!isEncryptedSecret(raw.trim())) {
      const secured = secureLegacyBackup(filePath, raw, checksum, stat);
      if (secured) {
        details = [details, "Encrypted rollback copy retained; restore with --restore-legacy-backup before editing."].filter(Boolean).join(" ");
        db.prepare("UPDATE legacy_imports SET details = ? WHERE source_key = ?").run(details, sourceKey);
      }
    }
    return {
      sourceKey,
      status: prior.status === "imported" ? "already-imported" : "skipped",
      rowCount: Number(prior.row_count || 0),
      details,
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    const parseError = `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
    const secured = secureLegacyBackup(filePath, raw, checksum, stat);
    const details = parseError + (secured
      ? " Encrypted rollback copy retained; restore with --restore-legacy-backup before editing or retrying."
      : " Source remains owner-restricted plaintext because it changed during backup; retry after resolving the file race.");
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

  const secured = secureLegacyBackup(filePath, raw, checksum, stat);
  const details = [
    outcome.details,
    secured
      ? "Encrypted rollback copy retained in the original JSON path; restore with --restore-legacy-backup."
      : "Source remains owner-restricted plaintext because backup encryption could not safely replace it; retry after resolving the file issue.",
  ].filter(Boolean).join(" ");
  db.prepare("UPDATE legacy_imports SET details = ? WHERE source_key = ?")
    .run(details || null, sourceKey);
  return { sourceKey, ...outcome, details };
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
    { file: "proxy.json", name: "proxy", handler: importProxyConfig },
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
