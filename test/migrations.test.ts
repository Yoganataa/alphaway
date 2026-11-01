import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { decryptSecret } from "../src/core/secrets";
import { MIGRATIONS, MigrationError, runMigrations } from "../src/core/migrations";
import type { Migration } from "../src/core/migrations";

const openDatabase = () => new Database(":memory:");

describe("SQLite migration runner", () => {
  let db: Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("initializes a fresh database and records the applied schema version", () => {
    db = openDatabase();

    const result = runMigrations(db);

    expect(result).toEqual({
      currentVersion: 2,
      applied: [
        { version: 1, name: "initial-schema" },
        { version: 2, name: "auth-security" },
      ],
    });

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row: any) => row.name);

    expect(tables).toContain("schema_migrations");
    expect(tables).toContain("custom_providers");
    expect(tables).toContain("request_logs");
    expect(tables).toContain("app_settings");
    expect(tables).toContain("legacy_imports");
    expect(tables).toContain("api_keys");
    expect(tables).toContain("admin_users");
    expect(tables).toContain("admin_sessions");

    const history = db
      .prepare("SELECT version, name FROM schema_migrations")
      .all();
    expect(history).toEqual([{ version: 1, name: "initial-schema" }, { version: 2, name: "auth-security" }]);
  });

  it("hashes legacy plaintext API keys and removes the legacy setting atomically", () => {
    db = openDatabase();
    runMigrations(db, [MIGRATIONS[0]]);

    const legacySecret = "sk-legacy-key-that-must-not-remain";
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run("alphaway_api_keys", JSON.stringify([{
        id: "legacy-key-1",
        name: "Legacy Integration",
        secret: legacySecret,
        createdAt: 1700000000000,
        status: "active",
        requestsCount: 7,
      }]), Date.now());

    const result = runMigrations(db);
    const stored = db.prepare(
      "SELECT id, name, key_prefix, secret_salt, secret_hash, status, requests_count FROM api_keys WHERE id = ?"
    ).get("legacy-key-1") as any;
    const expectedHash = createHash("sha256")
      .update(Buffer.from(stored.secret_salt, "hex"))
      .update(legacySecret, "utf8")
      .digest("hex");

    expect(result.currentVersion).toBe(2);
    expect(stored.name).toBe("Legacy Integration");
    expect(stored.key_prefix).toBe(legacySecret.slice(0, 16));
    expect(stored.secret_hash).toBe(expectedHash);
    expect(stored.secret_hash).not.toContain(legacySecret);
    expect(stored.requests_count).toBe(7);
    expect(stored.status).toBe("active");
    expect(db.prepare("SELECT value FROM app_settings WHERE key = ?")
      .get("alphaway_api_keys")).toBeNull();
  });
  it("adopts an existing pre-migration database without dropping or rewriting rows", () => {
    db = openDatabase();
    db.exec(`
      CREATE TABLE custom_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'openai',
        models TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      INSERT INTO custom_providers (
        id, name, base_url, api_key, protocol, models, enabled, created_at
      ) VALUES (
        'legacy-provider', 'Legacy', 'https://example.test', 'sk-legacy',
        'openai', '["legacy-model"]', 1, 1700000000000
      );
    `);

    const result = runMigrations(db);
    const row = db
      .prepare("SELECT id, name, api_key FROM custom_providers WHERE id = ?")
      .get("legacy-provider");

    expect(result.currentVersion).toBe(2);
    expect(row.id).toBe("legacy-provider");
    expect(row.name).toBe("Legacy");
    expect(row.api_key).toMatch(/^awenc:v1:/);
    expect(decryptSecret(row.api_key)).toBe("sk-legacy");
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM custom_providers").get().count
    ).toBe(1);
  });

  it("encrypts existing provider credentials and removes masked placeholders during migration", () => {
    db = openDatabase();
    runMigrations(db, [MIGRATIONS[0]]);
    const insert = db.prepare(`
      INSERT INTO custom_providers (id, name, base_url, api_key, protocol, models, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run("legacy-secret", "Legacy Secret", "https://provider.example", "sk-real-provider-secret", "openai", "[]", 1, Date.now());
    insert.run("legacy-placeholder", "Legacy Placeholder", "https://provider.example", "sk-xxxxxxxxxxxxxxxxxxxxxxxx", "openai", "[]", 1, Date.now());

    runMigrations(db);
    const encrypted = db.prepare("SELECT api_key FROM custom_providers WHERE id = ?").get("legacy-secret").api_key;
    const placeholder = db.prepare("SELECT api_key FROM custom_providers WHERE id = ?").get("legacy-placeholder").api_key;
    expect(encrypted).toMatch(/^awenc:v1:/);
    expect(encrypted).not.toContain("sk-real-provider-secret");
    expect(decryptSecret(encrypted)).toBe("sk-real-provider-secret");
    expect(placeholder).toBe("");
  });

  it("encrypts legacy single-proxy URLs, pool URLs, and relay tokens during migration", () => {
    db = openDatabase();
    runMigrations(db, [MIGRATIONS[0]]);
    const config = {
      url: "http://legacy-user:legacy-pass@proxy.example:8080",
      strategy: "failover",
      pool: [
        { url: "http://pool-user:pool-pass@pool.example:8080", label: "Pool" },
        { url: "https://relay.workers.dev", relay: true, token: "legacy-relay-token" },
      ],
    };
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run("proxy_config", JSON.stringify(config), Date.now());

    runMigrations(db);
    const stored = JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key = ?")
      .get("proxy_config").value);
    expect(stored.url).toMatch(/^awenc:v1:/);
    expect(stored.pool[0].url).toMatch(/^awenc:v1:/);
    expect(stored.pool[1].url).toMatch(/^awenc:v1:/);
    expect(stored.pool[1].token).toMatch(/^awenc:v1:/);
    expect(JSON.stringify(stored)).not.toContain("legacy-pass");
    expect(JSON.stringify(stored)).not.toContain("pool-pass");
    expect(JSON.stringify(stored)).not.toContain("legacy-relay-token");
    expect(decryptSecret(stored.url)).toBe(config.url);
    expect(decryptSecret(stored.pool[0].url)).toBe(config.pool[0].url);
    expect(decryptSecret(stored.pool[1].url)).toBe(config.pool[1].url);
    expect(decryptSecret(stored.pool[1].token)).toBe(config.pool[1].token);
  });
  it("does not reapply already-recorded migrations on repeated startup", () => {
    db = openDatabase();

    const first = runMigrations(db);
    const second = runMigrations(db);

    expect(first.applied).toHaveLength(2);
    expect(second.applied).toHaveLength(0);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count
    ).toBe(2);
  });

  it("rolls back migration DDL and history when a migration fails", () => {
    db = openDatabase();
    runMigrations(db);

    const failingMigration: Migration = {
      version: 3,
      name: "failing-test-migration",
      up(database) {
        database.exec("CREATE TABLE should_rollback (id INTEGER PRIMARY KEY)");
        throw new Error("simulated interruption");
      },
    };

    expect(() => runMigrations(db, [...MIGRATIONS, failingMigration])).toThrow(
      /Migration 3 .* simulated interruption/
    );

    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("should_rollback");
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get().count;

    expect(table).toBeNull();
    expect(count).toBe(2);
  });

  it("can retry a migration after its failed attempt was rolled back", () => {
    db = openDatabase();
    runMigrations(db);

    const recoveredMigration: Migration = {
      version: 3,
      name: "recovered-test-migration",
      up(database) {
        database.exec("CREATE TABLE recovered_state (value TEXT NOT NULL)");
      },
    };

    const result = runMigrations(db, [...MIGRATIONS, recoveredMigration]);
    expect(result.currentVersion).toBe(3);
    expect(result.applied).toEqual([
      { version: 3, name: "recovered-test-migration" },
    ]);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count
    ).toBe(3);
  });

  it("refuses destructive migrations unless a backup callback is provided", () => {
    db = openDatabase();
    runMigrations(db);

    const destructiveMigration: Migration = {
      version: 3,
      name: "destructive-test-migration",
      destructive: true,
      up(database) {
        database.exec("CREATE TABLE destructive_state (value TEXT NOT NULL)");
      },
    };

    expect(() => runMigrations(db, [...MIGRATIONS, destructiveMigration])).toThrow(
      /requires a database backup callback/
    );

    let backupWasCreated = false;
    const result = runMigrations(db, [...MIGRATIONS, destructiveMigration], {
      beforeDestructiveMigration(migration) {
        expect(migration.name).toBe("destructive-test-migration");
        backupWasCreated = true;
      },
    });

    expect(backupWasCreated).toBe(true);
    expect(result.currentVersion).toBe(3);
  });

  it("rejects a database created by a newer application schema", () => {
    db = openDatabase();
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (2, 'future-schema', '2026-11-01T00:00:00.000Z');
    `);

    expect(() => runMigrations(db)).toThrow(/not contiguous/);
  });

  it("rejects gaps and duplicate versions in the migration registry", () => {
    db = openDatabase();

    const gap: Migration = {
      version: 2,
      name: "missing-version-one",
      up() {},
    };
    expect(() => runMigrations(db, [gap])).toThrow(/contiguous/);

    const duplicate: Migration = {
      version: 1,
      name: "duplicate",
      up() {},
    };
    expect(() => runMigrations(db, [MIGRATIONS[0], duplicate])).toThrow(
      /Duplicate migration version/
    );
  });
});
