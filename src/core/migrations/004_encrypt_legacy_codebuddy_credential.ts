import { encryptSecret, isEncryptedSecret } from "../secrets";
import type { Migration } from "./types";

/**
 * Encrypt the legacy CodeBuddy OAuth credential in canonical SQLite settings.
 * Older releases wrote this setting through the generic JSON settings adapter,
 * so the ciphertext remains JSON-string encoded in app_settings.value.
 *
 * Re-arm the logical residue cleanup after replacing the old plaintext value;
 * startup performs the WAL checkpoint/VACUUM before the database is returned.
 */
export const encryptLegacyCodeBuddyCredentialMigration: Migration = {
  version: 4,
  name: "encrypt-legacy-codebuddy-credential",
  up(db) {
    const setting = db.prepare(
      "SELECT value FROM app_settings WHERE key = ?"
    ).get("codebuddy_api_key") as { value: string } | null;

    if (setting) {
      let credential: unknown;
      try {
        credential = JSON.parse(setting.value);
      } catch {
        throw new Error("Legacy CodeBuddy credential setting is not valid JSON; repair or remove it before upgrading");
      }

      if (credential !== null && credential !== "") {
        if (typeof credential !== "string") {
          throw new Error("Legacy CodeBuddy credential setting must contain a string");
        }
        if (!isEncryptedSecret(credential)) {
          db.prepare(
            "UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?"
          ).run(JSON.stringify(encryptSecret(credential)), Date.now(), "codebuddy_api_key");
        }
      }
    }

    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run("alpha_security_secret_scrub", JSON.stringify("pending"), Date.now());
  },
};
