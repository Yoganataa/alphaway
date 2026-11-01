import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMigrationBackup } from "../src/core/database";
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
      currentVersion: 1,
      applied: [{ version: 1, name: "initial-schema" }],
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

    const history = db
      .prepare("SELECT version, name FROM schema_migrations")
      .all();
    expect(history).toEqual([{ version: 1, name: "initial-schema" }]);
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

    expect(result.currentVersion).toBe(1);
    expect(row).toEqual({
      id: "legacy-provider",
      name: "Legacy",
      api_key: "sk-legacy",
    });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM custom_providers").get().count
    ).toBe(1);
  });

  it("does not reapply already-recorded migrations on repeated startup", () => {
    db = openDatabase();

    const first = runMigrations(db);
    const second = runMigrations(db);

    expect(first.applied).toHaveLength(1);
    expect(second.applied).toHaveLength(0);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count
    ).toBe(1);
  });

  it("rolls back migration DDL and history when a migration fails", () => {
    db = openDatabase();
    runMigrations(db);

    const failingMigration: Migration = {
      version: 2,
      name: "failing-test-migration",
      up(database) {
        database.exec("CREATE TABLE should_rollback (id INTEGER PRIMARY KEY)");
        throw new Error("simulated interruption");
      },
    };

    expect(() => runMigrations(db, [...MIGRATIONS, failingMigration])).toThrow(
      /Migration 2 .* simulated interruption/
    );

    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("should_rollback");
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get().count;

    expect(table).toBeNull();
    expect(count).toBe(1);
  });

  it("can retry a migration after its failed attempt was rolled back", () => {
    db = openDatabase();
    runMigrations(db);

    const recoveredMigration: Migration = {
      version: 2,
      name: "recovered-test-migration",
      up(database) {
        database.exec("CREATE TABLE recovered_state (value TEXT NOT NULL)");
      },
    };

    const result = runMigrations(db, [...MIGRATIONS, recoveredMigration]);
    expect(result.currentVersion).toBe(2);
    expect(result.applied).toEqual([
      { version: 2, name: "recovered-test-migration" },
    ]);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count
    ).toBe(2);
  });

  it("refuses destructive migrations unless a backup callback is provided", () => {
    db = openDatabase();
    runMigrations(db);

    const destructiveMigration: Migration = {
      version: 2,
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
    expect(result.currentVersion).toBe(2);
  });

  it("creates a consistent standalone SQLite backup before destructive schema changes", () => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-backup-test-"));
    const databasePath = path.join(backupDir, "alphaway.sqlite");
    const source = new Database(databasePath);

    try {
      source.exec("PRAGMA journal_mode = WAL");
      source.exec("CREATE TABLE preserved_data (value TEXT NOT NULL)");
      source.prepare("INSERT INTO preserved_data (value) VALUES (?)").run("keep-this-row");

      const backupPath = createMigrationBackup(source, databasePath, "test destructive migration");

      expect(fs.existsSync(backupPath)).toBe(true);
      expect(path.dirname(backupPath)).toBe(path.join(backupDir, "backups"));
      if (process.platform !== "win32") {
        expect(fs.statSync(backupPath).mode & 0o777).toBe(0o600);
      }

      const backup = new Database(backupPath, { readonly: true });
      try {
        expect(backup.prepare("SELECT value FROM preserved_data").get()).toEqual({
          value: "keep-this-row",
        });
      } finally {
        backup.close();
      }
    } finally {
      source.close();
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
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
