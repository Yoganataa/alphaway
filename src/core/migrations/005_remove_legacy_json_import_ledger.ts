import type { Migration } from "./types";

/**
 * Remove the bookkeeping table used only by the retired standalone JSON
 * importer. Application state remains in the canonical SQLite tables; this
 * table contains no provider, credential, usage, or settings data.
 *
 * Keep the historical v1 migration immutable and clean up its obsolete table
 * through a forward-only schema migration instead.
 */
export const removeLegacyJsonImportLedgerMigration: Migration = {
  version: 5,
  name: "remove-legacy-json-import-ledger",
  up(db) {
    db.exec("DROP TABLE IF EXISTS legacy_imports;");
  },
};
