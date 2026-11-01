/**
 * Small migration contract for Bun's native SQLite database.
 *
 * Migrations are forward-only. A migration and its history row are committed
 * together so startup can safely retry after an interrupted upgrade.
 */
export interface Migration {
  version: number;
  name: string;
  /** Destructive migrations require a successful database backup before execution. */
  destructive?: boolean;
  up(db: any): void;
}

export interface MigrationRunOptions {
  beforeDestructiveMigration?: (migration: Migration) => void;
}

export interface MigrationRunResult {
  currentVersion: number;
  applied: Array<{ version: number; name: string }>;
}
