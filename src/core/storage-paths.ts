import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface StoragePathOptions {
  env?: Record<string, string | undefined>;
  envFile?: Record<string, string>;
  cwd?: string;
  homeDir?: string;
  platform?: string;
}

export interface ResolvedStoragePaths {
  dataDir: string;
  databasePath: string;
  explicitDatabasePath: boolean;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Parse the small, conventional KEY=VALUE subset used by the application's
 * .env file. Runtime environment variables always take precedence.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? "";
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === "\"" || value[0] === "'")) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === "\"") {
        value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\\\/g, "\\").replace(/\\\"/g, "\"");
      }
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    result[key] = value;
  }
  return result;
}

function envFileCandidates(): string[] {
  const candidates: string[] = [];
  const explicit = nonEmpty(process.env.ALPHAWAY_ENV_FILE);
  if (explicit) candidates.push(path.resolve(explicit));

  candidates.push(path.resolve(process.cwd(), ".env"));

  // A compiled AlphaWay executable and an invoked TypeScript entry point both
  // keep their deployment .env beside the runnable artifact.
  // A compiled standalone AlphaWay binary owns its adjacent .env; in source
  // mode process.execPath is Bun itself, not the application directory.
  if (process.execPath && /^alphaway(?:\.exe)?$/i.test(path.basename(process.execPath))) {
    candidates.push(path.resolve(path.dirname(process.execPath), ".env"));
  }
  const entryPoint = process.argv[1];
  if (entryPoint && (entryPoint.endsWith(".ts") || entryPoint.endsWith(".js") || entryPoint.endsWith(".mjs"))) {
    candidates.push(path.resolve(path.dirname(entryPoint), ".env"));
  }

  // In source mode this resolves from src/core to the repository root.
  candidates.push(path.resolve(import.meta.dir, "../../.env"));
  return [...new Set(candidates)];
}

function readEnvFile(): { path?: string; values: Record<string, string> } {
  for (const candidate of envFileCandidates()) {
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isFile() || stat.size > 1024 * 1024) continue;
      return { path: candidate, values: parseEnvFile(fs.readFileSync(candidate, "utf8")) };
    } catch {}
  }
  return { values: {} };
}

export function resolveStoragePaths(options: StoragePathOptions = {}): ResolvedStoragePaths {
  const env = options.env ?? process.env;
  const envFile = options.envFile ?? readEnvFile().values;
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? (
    platform === "win32"
      ? nonEmpty(env.USERPROFILE) ?? nonEmpty(env.HOME) ?? os.homedir()
      : nonEmpty(env.HOME) ?? nonEmpty(env.USERPROFILE) ?? os.homedir()
  );

  // Process environment always wins over .env, including when the old
  // AlphaWay variable is used by an existing service unit.
  const configuredDataDir =
    nonEmpty(env.DATA_DIR) ??
    nonEmpty(env.ALPHAWAY_STATE_DIR) ??
    nonEmpty(env.OPENCODE_BRIDGE_STATE_DIR) ??
    nonEmpty(envFile.DATA_DIR) ??
    // Retain old variable names as compatibility aliases; new installs use
    // DATA_DIR, matching 9router-go.
    nonEmpty(envFile.ALPHAWAY_STATE_DIR) ??
    nonEmpty(envFile.OPENCODE_BRIDGE_STATE_DIR);

  let dataDir: string;
  if (configuredDataDir) {
    dataDir = path.resolve(cwd, configuredDataDir);
  } else if (platform === "win32") {
    const appData = nonEmpty(env.APPDATA) ?? path.join(homeDir, "AppData", "Roaming");
    dataDir = path.join(appData, "AlphaWay");
  } else {
    dataDir = path.join(homeDir, ".alphaway");
  }

  const dbSetting = nonEmpty(env.DB_PATH) ??
    nonEmpty(env.ALPHAWAY_DB_PATH) ??
    nonEmpty(envFile.DB_PATH) ??
    nonEmpty(envFile.ALPHAWAY_DB_PATH);
  const explicitDatabasePath = Boolean(dbSetting);
  const databasePath = dbSetting === ":memory:"
    ? ":memory:"
    : dbSetting
      ? path.resolve(cwd, dbSetting)
      : path.join(dataDir, "db", "data.sqlite");

  return { dataDir, databasePath, explicitDatabasePath };
}

/** The canonical data root for database, encryption key, proxy cache and daemon files. */
export function resolveDataDir(): string {
  return resolveStoragePaths().dataDir;
}

/**
 * Match 9router-go's DB_PATH directory conventions while retaining the
 * previous AlphaWay database filename as a compatibility fallback.
 */
export function resolveDatabasePath(): string {
  const resolved = resolveStoragePaths();
  const requested = resolved.databasePath;

  if (resolved.explicitDatabasePath) {
    try {
      if (fs.statSync(requested).isDirectory()) {
        const candidates = [
          path.join(requested, "db", "data.sqlite"),
          path.join(requested, "data.sqlite"),
          path.join(requested, "9router.db"),
          path.join(requested, "alphaway.sqlite"),
        ];
        return candidates.find((candidate) => fs.existsSync(candidate)) ?? path.join(requested, "db", "data.sqlite");
      }
    } catch {}
    return requested;
  }

  // Do not silently create an empty database when upgrading an installation
  // that still has the previous AlphaWay filename. The old file remains the
  // active database until an explicit, verified layout migration is performed.
  const oldDatabase = path.join(resolved.dataDir, "alphaway.sqlite");
  if (!fs.existsSync(requested) && fs.existsSync(oldDatabase)) return oldDatabase;
  return requested;
}

/** .env path used by local CLI and dashboard OAuth credential persistence. */
export function resolveEnvFilePath(): string {
  const explicit = nonEmpty(process.env.ALPHAWAY_ENV_FILE);
  if (explicit) return path.resolve(explicit);
  const existing = envFileCandidates().find((candidate) => {
    try { return fs.statSync(candidate).isFile(); } catch { return false; }
  });
  return existing ?? path.resolve(process.cwd(), ".env");
}

/** Create and re-assert an owner-only directory on POSIX. */
export function ensurePrivateDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("SQLite data directory must be a regular, non-symlink directory");
  }
  if (process.platform !== "win32") fs.chmodSync(directory, 0o700);
}
