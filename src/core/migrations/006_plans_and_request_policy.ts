import type { Migration } from "./types";

/**
 * Phase 3 policy templates and managed-key policy assignment.
 *
 * Existing API keys remain unassigned (NULL) and therefore retain their
 * Phase 2 behavior. Historical request rows remain unattributed; the new
 * nullable client_api_key_id column is populated only for future requests.
 */
export const plansAndRequestPolicyMigration: Migration = {
  version: 6,
  name: "plans-and-request-policy",
  up(db) {
    db.exec(`
      CREATE TABLE plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        rpm_limit INTEGER NOT NULL DEFAULT 0 CHECK (rpm_limit >= 0),
        tpm_limit INTEGER NOT NULL DEFAULT 0 CHECK (tpm_limit >= 0),
        concurrency_limit INTEGER NOT NULL DEFAULT 0 CHECK (concurrency_limit >= 0),
        allowed_models TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      ALTER TABLE api_keys ADD COLUMN plan_id TEXT REFERENCES plans(id) ON DELETE RESTRICT;
      ALTER TABLE api_keys ADD COLUMN rate_limit_rpm INTEGER CHECK (rate_limit_rpm IS NULL OR rate_limit_rpm >= 0);
      ALTER TABLE api_keys ADD COLUMN rate_limit_tpm INTEGER CHECK (rate_limit_tpm IS NULL OR rate_limit_tpm >= 0);
      ALTER TABLE api_keys ADD COLUMN concurrency_limit INTEGER CHECK (concurrency_limit IS NULL OR concurrency_limit >= 0);
      ALTER TABLE api_keys ADD COLUMN allowed_models TEXT;

      ALTER TABLE request_logs ADD COLUMN client_api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL;

      CREATE INDEX idx_api_keys_plan_id ON api_keys(plan_id);
      CREATE INDEX idx_request_logs_client_key_timestamp
        ON request_logs(client_api_key_id, timestamp);
    `);
  },
};
