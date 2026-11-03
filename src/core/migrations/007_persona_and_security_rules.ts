import type { Migration } from "./types";

const DEFAULT_SECURITY_RULES = [
  ["rule-1", "browser_cookies_db", "block", "Anti-Infostealer: Protect browser cookies and login databases"],
  ["rule-2", "dpapi_masterkey", "block", "Anti-Infostealer: Protect Windows DPAPI credentials and vault"],
  ["rule-3", "keychain_access", "block", "Anti-Infostealer: Protect macOS Keychain database"],
  ["rule-4", "openai_secret_token", "mask", "DLP: Redact provider API keys before forwarding"],
  ["rule-5", "aws_credentials", "mask", "DLP: Redact AWS access keys and session secrets"],
] as const;

/**
 * Phase 4 Persona library and live security-rule enforcement.
 *
 * Persona prompt content, model bindings, keyword rules and Security Rules are
 * stored as normalized SQLite rows. The legacy app_settings security_rules
 * value is migrated once and removed after successful import.
 */
export const personaAndSecurityRulesMigration: Migration = {
  version: 7,
  name: "persona-and-security-rules",
  up(db) {
    db.exec(`
      CREATE TABLE persona_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
        used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE persona_preset_keywords (
        preset_id TEXT NOT NULL REFERENCES persona_presets(id) ON DELETE CASCADE,
        rule_type TEXT NOT NULL CHECK (rule_type IN ('include', 'exclude')),
        text TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('word', 'partial')),
        sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
        PRIMARY KEY (preset_id, rule_type, text, mode)
      );

      CREATE INDEX idx_persona_keywords_type
        ON persona_preset_keywords(rule_type, preset_id, sort_order);

      CREATE TABLE persona_model_bindings (
        model_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        preset_id TEXT REFERENCES persona_presets(id) ON DELETE CASCADE,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_persona_bindings_preset
        ON persona_model_bindings(preset_id, enabled);

      CREATE TABLE persona_global_excludes (
        text TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('word', 'partial')),
        sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
        PRIMARY KEY (text, mode)
      );

      CREATE TABLE security_rules (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('mask', 'block')),
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_security_rules_enabled_order
        ON security_rules(enabled, sort_order, id);
    `);

    const legacy = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("security_rules") as { value?: string } | undefined;
    const insert = db.prepare(`
      INSERT INTO security_rules (id, pattern, action, description, enabled, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);
    const now = new Date().toISOString();
    // A valid empty array is an explicit "no custom rules" configuration.
    // Non-empty legacy arrays with no valid entries fall back to safe defaults.
    let imported = false;

    if (legacy?.value) {
      try {
        const parsed = JSON.parse(legacy.value);
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) imported = true;
          parsed.slice(0, 100).forEach((entry: any, index: number) => {
            if (
              entry &&
              typeof entry === "object" &&
              typeof entry.id === "string" &&
              /^[a-zA-Z0-9_-]{1,64}$/.test(entry.id) &&
              typeof entry.pattern === "string" &&
              entry.pattern.trim().length > 0 &&
              entry.pattern.trim().length <= 128 &&
              Array.from(entry.pattern.trim()).every((character: string) => {
                const code = character.codePointAt(0) ?? 0;
                return code >= 32 && !(code >= 127 && code <= 159);
              }) &&
              (entry.action === "mask" || entry.action === "block") &&
              typeof entry.description === "string" &&
              typeof entry.enabled === "boolean"
            ) {
              insert.run(
                entry.id,
                entry.pattern.trim(),
                entry.action,
                entry.description.trim().slice(0, 256),
                entry.enabled ? 1 : 0,
                index,
                now,
                now
              );
              imported = true;
            }
          });
        }
      } catch {
        // Invalid legacy JSON is not trusted; seed the safe defaults below.
      }
    }

    if (!legacy || !imported) {
      DEFAULT_SECURITY_RULES.forEach(([id, pattern, action, description], index) => {
        insert.run(id, pattern, action, description, 1, index, now, now);
      });
    }

    if (legacy) {
      db.prepare("DELETE FROM app_settings WHERE key = ?").run("security_rules");
    }
  },
};
