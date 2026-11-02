import { initialSchemaMigration } from "./001_initial_schema";
import { authSecurityMigration } from "./002_auth_security";
import { secretResidueCleanupMigration } from "./003_secret_residue_cleanup";
import type { Migration, MigrationRunOptions, MigrationRunResult } from "./types";

export type { Migration, MigrationRunOptions, MigrationRunResult } from "./types";

export const MIGRATIONS: readonly Migration[] = [initialSchemaMigration, authSecurityMigration, secretResidueCleanupMigration];

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

function validateRegistry(registry: readonly Migration[]): Migration[] {
  const ordered = [...registry].sort((a, b) => a.version - b.version);
  const seen = new Set<number>();

  for (let index = 0; index < ordered.length; index += 1) {
    const migration = ordered[index];
    if (!Number.isSafeInteger(migration.version) || migration.version < 1) {
      throw new MigrationError(`Invalid migration version: ${migration.version}`);
    }
    if (!migration.name.trim()) {
      throw new MigrationError(`Migration ${migration.version} has an empty name`);
    }
    if (seen.has(migration.version)) {
      throw new MigrationError(`Duplicate migration version: ${migration.version}`);
    }
    if (migration.version !== index + 1) {
      throw new MigrationError(
        `Migration registry must be contiguous from version 1; expected ${index + 1}, found ${migration.version}`
      );
    }
    seen.add(migration.version);
  }

  return ordered;
}

/**
 * Apply ordered migrations and persist each version in the same SQLite
 * transaction as its DDL/data changes.
 *
 * Calling this function repeatedly is safe. A database created by older
 * AlphaWay versions has no schema_migrations table; migration 1 adopts its
 * existing tables through CREATE IF NOT EXISTS, retaining all rows.
 */
export function runMigrations(
  db: any,
  registry: readonly Migration[] = MIGRATIONS,
  options: MigrationRunOptions = {}
): MigrationRunResult {
  const ordered = validateRegistry(registry);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const history = db
    .prepare("SELECT version, name FROM schema_migrations ORDER BY version ASC")
    .all() as Array<{ version: number; name: string }>;

  for (let index = 0; index < history.length; index += 1) {
    const record = history[index];
    const expectedVersion = index + 1;
    if (record.version !== expectedVersion) {
      throw new MigrationError(
        `Migration history is not contiguous: expected ${expectedVersion}, found ${record.version}`
      );
    }
    const known = ordered[record.version - 1];
    if (!known || known.name !== record.name) {
      throw new MigrationError(
        `Database migration ${record.version} (${record.name}) is not present in this application build`
      );
    }
  }

  const currentVersion = history.at(-1)?.version ?? 0;
  const latestVersion = ordered.at(-1)?.version ?? 0;
  if (currentVersion > latestVersion) {
    throw new MigrationError(
      `Database schema version ${currentVersion} is newer than this application supports (${latestVersion})`
    );
  }

  const applied: Array<{ version: number; name: string }> = [];
  for (const migration of ordered) {
    if (migration.version <= currentVersion) continue;

    if (migration.version !== (applied.at(-1)?.version ?? currentVersion) + 1) {
      throw new MigrationError(
        `Cannot apply migration ${migration.version}; the preceding version is missing`
      );
    }

    if (migration.destructive) {
      if (!options.beforeDestructiveMigration) {
        throw new MigrationError(
          `Destructive migration ${migration.version} (${migration.name}) requires a database backup callback`
        );
      }
      try {
        options.beforeDestructiveMigration(migration);
      } catch (error) {
        throw new MigrationError(
          `Backup before destructive migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      ).run(migration.version, migration.name, new Date().toISOString());
    });

    try {
      apply();
    } catch (error) {
      throw new MigrationError(
        `Migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    applied.push({ version: migration.version, name: migration.name });
  }

  return {
    currentVersion: ordered.at(-1)?.version ?? currentVersion,
    applied,
  };
}
