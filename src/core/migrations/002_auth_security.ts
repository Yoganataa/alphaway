import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Migration } from "./types";
import { encryptSecret, isEncryptedSecret } from "../secrets";
import { hasEmbeddedProviderUrlSecrets } from "../provider-url-secrets";

function hashLegacyKey(secret: string, salt: string): string {
  return createHash("sha256").update(Buffer.from(salt, "hex")).update(secret, "utf8").digest("hex");
}

export const authSecurityMigration: Migration = {
  version: 2,
  name: "auth-security",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        secret_salt TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT '["inference"]',
        status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        requests_count INTEGER NOT NULL DEFAULT 0,
        revoked_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_api_keys_prefix_status
        ON api_keys(key_prefix, status);

      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
        ON admin_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_user
        ON admin_sessions(user_id);
    `);

    // Encrypt legacy provider credentials as part of the upgrade, in the same
    // transaction as the schema and API-key migration.
    const providerRows = db.prepare(
      "SELECT id, api_key, base_url FROM custom_providers"
    ).all() as Array<{ id: string; api_key: string; base_url: string }>;
    const updateProviderCredentials = db.prepare(
      "UPDATE custom_providers SET api_key = ?, base_url = ? WHERE id = ?"
    );
    for (const provider of providerRows) {
      const storedKey = String(provider.api_key || "");
      let apiKey = storedKey;
      if (storedKey.includes("xxxxxxxx")) {
        apiKey = "";
      } else if (storedKey && !isEncryptedSecret(storedKey)) {
        apiKey = encryptSecret(storedKey);
      }

      let baseUrl = String(provider.base_url || "");
      if (!isEncryptedSecret(baseUrl) && hasEmbeddedProviderUrlSecrets(baseUrl)) {
        baseUrl = encryptSecret(baseUrl);
      }

      if (apiKey !== storedKey || baseUrl !== String(provider.base_url || "")) {
        updateProviderCredentials.run(apiKey, baseUrl, provider.id);
      }
    }

    // Encrypt legacy proxy credentials, including relay tokens, as part of the
    // same atomic schema upgrade.
    const proxySetting = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("proxy_config") as
      | { value: string }
      | null;
    if (proxySetting) {
      let proxyConfig: unknown;
      try { proxyConfig = JSON.parse(proxySetting.value); } catch { proxyConfig = null; }
      if (proxyConfig && typeof proxyConfig === "object" && !Array.isArray(proxyConfig)) {
        const config = { ...(proxyConfig as Record<string, unknown>) };
        if (typeof config.url === "string") config.url = encryptSecret(config.url);
        if (Array.isArray(config.pool)) {
          config.pool = config.pool.map((entry) => {
            if (typeof entry === "string") return encryptSecret(entry);
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
            const safe = { ...(entry as Record<string, unknown>) };
            for (const field of ["url", "token", "auth"]) {
              if (typeof safe[field] === "string") safe[field] = encryptSecret(safe[field] as string);
            }
            return safe;
          });
        }
        db.prepare("UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?")
          .run(JSON.stringify(config), Date.now(), "proxy_config");
      }
    }
    // One-time conversion of the pre-Phase-2 plaintext API key setting.
    // The source value is deleted only after every valid record has been hashed.
    const legacy = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("alphaway_api_keys") as
      | { value: string }
      | null;
    if (!legacy) return;

    let records: unknown;
    try {
      records = JSON.parse(legacy.value);
    } catch {
      throw new Error("Legacy alphaway_api_keys setting is not valid JSON; restore or repair it before upgrading");
    }
    if (!Array.isArray(records)) {
      throw new Error("Legacy alphaway_api_keys setting must contain an array");
    }

    const insert = db.prepare(`
      INSERT INTO api_keys (
        id, name, key_prefix, secret_salt, secret_hash, scopes, status,
        created_at, last_used_at, requests_count, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const seenIds = new Set<string>();

    for (const item of records) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("Legacy API key record is malformed; no legacy records were removed");
      }
      const row = item as Record<string, unknown>;
      const secret = typeof row.secret === "string" ? row.secret.trim() : "";
      if (!secret) {
        throw new Error("Legacy API key record has no secret; no legacy records were removed");
      }

      const requestedId = typeof row.id === "string" && row.id.trim() ? row.id.trim() : randomUUID();
      const id = seenIds.has(requestedId) ? randomUUID() : requestedId;
      seenIds.add(id);
      const name = typeof row.name === "string" && row.name.trim()
        ? row.name.trim().slice(0, 80)
        : "Imported API key";
      const salt = randomBytes(16).toString("hex");
      const status = row.status === "revoked" ? "revoked" : "active";
      const createdAt = Number.isFinite(Number(row.createdAt)) ? Number(row.createdAt) : Date.now();
      const lastUsedAt = Number.isFinite(Number(row.lastUsedAt)) ? Number(row.lastUsedAt) : null;
      const requestsCount = Number.isFinite(Number(row.requestsCount))
        ? Math.max(0, Math.trunc(Number(row.requestsCount)))
        : 0;

      insert.run(
        id,
        name,
        secret.slice(0, 16),
        salt,
        hashLegacyKey(secret, salt),
        JSON.stringify(["inference"]),
        status,
        createdAt,
        lastUsedAt,
        requestsCount,
        status === "revoked" ? (lastUsedAt ?? createdAt) : null
      );
    }

    db.prepare("DELETE FROM app_settings WHERE key = ?").run("alphaway_api_keys");
  },
};
