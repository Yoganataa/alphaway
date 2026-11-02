import type { Migration } from "./types";

/**
 * Marks legacy SQLite pages for a one-time secure rewrite after migration v2
 * has encrypted credentials. The database bootstrap performs the WAL
 * checkpoint/VACUUM outside the migration transaction, then marks this
 * setting complete only after the cleanup succeeds.
 */
export const secretResidueCleanupMigration: Migration = {
  version: 3,
  name: "secret-residue-cleanup",
  up(db) {
    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run("alpha_security_secret_scrub", JSON.stringify("pending"), Date.now());
  },
};
