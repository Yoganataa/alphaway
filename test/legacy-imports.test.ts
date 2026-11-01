import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMigrations } from "../src/core/migrations";
import { decryptSecret, isEncryptedSecret } from "../src/core/secrets";
import { importLegacyJson, restoreLegacyBackup } from "../src/core/legacy-imports";

describe("legacy JSON import", () => {
  const writeJson = (dir: string, name: string, value: unknown) => {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), "utf8");
  };

  function withSandbox<T>(
    includeLegacy: boolean,
    run: (context: {
      db: Database;
      stateDir: string;
      legacyDir?: string;
      readSetting: (key: string) => any;
    }) => T
  ): T {
    const db = new Database(":memory:");
    runMigrations(db);
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-state-"));
    const legacyDir = includeLegacy
      ? fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-legacy-"))
      : undefined;

    const readSetting = (key: string) => {
      const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
        | { value: string }
        | null;
      return row ? JSON.parse(row.value) : null;
    };

    try {
      return run({ db, stateDir, legacyDir, readSetting });
    } finally {
      db.close();
      fs.rmSync(stateDir, { recursive: true, force: true });
      if (legacyDir) fs.rmSync(legacyDir, { recursive: true, force: true });
    }
  }

  it("imports providers, usage, TokenSaver and proxy settings exactly once", () => withSandbox(true, ({ db, stateDir, legacyDir, readSetting }) => {

    // SQLite settings are authoritative and must not be replaced by old files.
    db.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
    ).run("tokensaver_config", JSON.stringify({ rtkEnabled: false, soulMode: "custom" }), Date.now());

    writeJson(stateDir, "custom_providers.json", [
      {
        id: "legacy-deepseek",
        name: "Legacy DeepSeek",
        baseUrl: "https://legacy-user:legacy-password@api.deepseek.com/v1?api_key=legacy-url-query-secret&tenant=import-test",
        apiKey: "sk-legacy-deepseek",
        protocol: "openai",
        models: ["deepseek-chat"],
        enabled: true,
        createdAt: 1700000000000,
      },
    ]);

    writeJson(stateDir, "usage_stats.json", {
      totalRequests: 4,
      successfulRequests: 3,
      failedRequests: 1,
      totalPromptTokens: 120,
      totalCompletionTokens: 80,
      totalTokens: 200,
      savedTokens: 15,
      estimatedSavingsUsd: 0.01,
      byModel: { "legacy-model": { requests: 4, promptTokens: 120, completionTokens: 80, totalTokens: 200, lastUsed: "2026-10-31T00:00:00.000Z" } },
      byProtocol: {
        openai: { requests: 4, tokens: 200, promptTokens: 120, completionTokens: 80, lastUsed: "2026-10-31T00:00:00.000Z" },
        anthropic: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
        responses: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
      },
      byProvider: {
        opencode: { requests: 4, tokens: 200, promptTokens: 120, completionTokens: 80, lastUsed: "2026-10-31T00:00:00.000Z" },
        codebuddy: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
        custom: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
      },
      dailyHistory: { "2026-10-31": { requests: 4, tokens: 200 } },
      hourlyHistory: {},
      recentLogs: [
        {
          id: "req_legacy_001",
          timestamp: "2026-10-31T10:00:00.000Z",
          protocol: "openai",
          model: "legacy-model",
          provider: "opencode",
          status: 200,
          latencyMs: 45,
          promptTokens: 30,
          completionTokens: 20,
          totalTokens: 50,
          savedTokens: 5,
          stream: false,
        },
      ],
    });

    writeJson(stateDir, "tokensaver.json", { rtkEnabled: true, soulMode: "preset" });
    writeJson(legacyDir!, "tokensaver.json", { rtkEnabled: true, soulMode: "auto" });
    writeJson(stateDir, "proxy.json", {
      url: "http://user:secret@127.0.0.1:3128",
      strategy: "failover",
      pool: [{ id: "egress-1", label: "primary", url: "http://user:secret@127.0.0.1:3128", enabled: true, weight: 1 }],
      cooldownMs: 180000,
      maxCooldownMs: 900000,
    });

    const first = importLegacyJson(db, stateDir, [legacyDir!]);
    expect(first).toHaveLength(5);
    expect(first.every((report) => report.status === "imported")).toBe(true);

    const proxyImport = first.find((report) => report.sourceKey === `proxy:${path.resolve(stateDir!, "proxy.json")}`);
    expect(proxyImport).toEqual({
      sourceKey: `proxy:${path.resolve(stateDir, "proxy.json")}`,
      status: "imported",
      rowCount: 1,
    });

    const provider = db.prepare(
      "SELECT id, base_url, api_key, models FROM custom_providers WHERE id = ?"
    ).get("legacy-deepseek") as { id: string; base_url: string; api_key: string; models: string };
    expect(provider.id).toBe("legacy-deepseek");
    expect(provider.base_url).toMatch(/^awenc:v1:/);
    expect(provider.base_url).not.toContain("legacy-user");
    expect(provider.base_url).not.toContain("legacy-password");
    expect(provider.base_url).not.toContain("legacy-url-query-secret");
    expect(decryptSecret(provider.base_url)).toBe("https://legacy-user:legacy-password@api.deepseek.com/v1?api_key=legacy-url-query-secret&tenant=import-test");
    expect(provider.api_key).toMatch(/^awenc:v1:/);
    expect(provider.api_key).not.toContain("sk-legacy-deepseek");
    expect(decryptSecret(provider.api_key)).toBe("sk-legacy-deepseek");
    expect(JSON.parse(provider.models)).toEqual(["deepseek-chat"]);

    const usage = readSetting("usage_stats_snapshot");
    expect(usage.totalRequests).toBe(4);
    expect(usage.dailyHistory["2026-10-31"].tokens).toBe(200);
    expect(db.prepare("SELECT id FROM request_logs WHERE id = ?").get("req_legacy_001")).toBeDefined();

    // Pre-existing SQLite state wins over either JSON source.
    expect(readSetting("tokensaver_config")).toEqual({ rtkEnabled: false, soulMode: "custom" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM app_settings WHERE key IS NULL").get().count).toBe(0);
    const importedProxy = readSetting("proxy_config");
    expect(importedProxy.url).toMatch(/^awenc:v1:/);
    expect(importedProxy.pool[0].url).toMatch(/^awenc:v1:/);
    expect(JSON.stringify(importedProxy)).not.toContain("user:secret");
    expect(decryptSecret(importedProxy.url)).toBe("http://user:secret@127.0.0.1:3128");
    expect(decryptSecret(importedProxy.pool[0].url)).toBe("http://user:secret@127.0.0.1:3128");
    expect(importedProxy.strategy).toBe("failover");
    expect(importedProxy.pool[0]).toMatchObject({ id: "egress-1", label: "primary", enabled: true, weight: 1 });
    expect(importedProxy.cooldownMs).toBe(180000);
    expect(importedProxy.maxCooldownMs).toBe(900000);

    const importedCount = db.prepare(
      "SELECT COUNT(*) AS count FROM legacy_imports WHERE status = 'imported'"
    ).get().count;
    expect(importedCount).toBe(5);

    // Source files are retained as recovery copies, but POSIX permissions are
    // restricted because legacy JSON may still contain plaintext credentials.
    expect(fs.existsSync(path.join(stateDir, "custom_providers.json"))).toBe(true);
    if (process.platform !== "win32") {
      expect(fs.statSync(path.join(stateDir, "custom_providers.json")).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.join(stateDir, "proxy.json")).mode & 0o777).toBe(0o600);
    }
    expect(fs.existsSync(path.join(stateDir, "usage_stats.json"))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "tokensaver.json"))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "proxy.json"))).toBe(true);

    for (const name of ["custom_providers.json", "usage_stats.json", "tokensaver.json", "proxy.json"]) {
      const backup = fs.readFileSync(path.join(stateDir, name), "utf8");
      expect(isEncryptedSecret(backup.trim())).toBe(true);
      expect(backup).not.toContain("sk-legacy-deepseek");
      expect(backup).not.toContain("user:secret");
    }

    const restoredPath = path.join(stateDir, "restored_custom_providers.json");
    restoreLegacyBackup(path.join(stateDir, "custom_providers.json"), restoredPath);
    const restoredProviders = JSON.parse(fs.readFileSync(restoredPath, "utf8"));
    expect(restoredProviders[0].apiKey).toBe("sk-legacy-deepseek");
    if (process.platform !== "win32") {
      expect(fs.statSync(restoredPath).mode & 0o777).toBe(0o600);
    }
    expect(() => restoreLegacyBackup(path.join(stateDir, "custom_providers.json"), restoredPath)).toThrow();

    const second = importLegacyJson(db, stateDir, [legacyDir!]);
    expect(second.every((report) => report.status === "already-imported")).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS count FROM custom_providers").get().count).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS count FROM request_logs").get().count).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS count FROM legacy_imports").get().count).toBe(5);
  }));
  it("refuses symlinked legacy JSON sources instead of reading through them", () => withSandbox(false, ({ db, stateDir }) => {
    const target = path.join(stateDir, "provider-data.json");
    const source = path.join(stateDir, "custom_providers.json");
    writeJson(stateDir, "provider-data.json", [{
      id: "must-not-import",
      name: "Linked Provider",
      baseUrl: "https://provider.example.test/v1",
      apiKey: "sk-should-not-be-imported",
      models: ["linked-model"],
    }]);
    fs.symlinkSync(target, source);

    const reports = importLegacyJson(db, stateDir, []);
    const expectedSourceKey = "custom_providers:" + path.resolve(source);
    const providerReport = reports.find((report) => report.sourceKey === expectedSourceKey);
    expect(providerReport?.status).toBe("skipped");
    expect(providerReport?.details).toContain("non-symlink");
    expect(db.prepare("SELECT COUNT(*) AS count FROM custom_providers").get().count).toBe(0);
  }));

  it("records invalid JSON as skipped and retries after the source changes", () => withSandbox(false, ({ db, stateDir, legacyDir, readSetting }) => {

    const file = path.join(stateDir, "custom_providers.json");
    fs.writeFileSync(file, "{broken json", "utf8");

    const skipped = importLegacyJson(db, stateDir, []);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].status).toBe("skipped");
    expect(skipped[0].details).toContain("Invalid JSON");

    const encryptedInvalidBackup = fs.readFileSync(file, "utf8");
    expect(isEncryptedSecret(encryptedInvalidBackup.trim())).toBe(true);
    const restoredInvalidPath = path.join(stateDir, "invalid-restored.json");
    restoreLegacyBackup(file, restoredInvalidPath);
    expect(fs.readFileSync(restoredInvalidPath, "utf8")).toBe("{broken json");

    const unchanged = importLegacyJson(db, stateDir, []);
    expect(unchanged[0].status).toBe("skipped");
    expect(unchanged[0].details).toContain("Encrypted rollback copy");

    // An operator may repair the source file and retry without manually
    // deleting its ledger row. The changed checksum permits a retry.
    writeJson(stateDir, "custom_providers.json", [
      {
        id: "repaired-provider",
        name: "Repaired",
        baseUrl: "https://example.test/v1",
        apiKey: "sk-repaired",
        models: ["repaired-model"],
      },
    ]);

    const repaired = importLegacyJson(db, stateDir, []);
    expect(repaired[0].status).toBe("imported");
    expect(db.prepare("SELECT id FROM custom_providers WHERE id = ?").get("repaired-provider")).toBeDefined();
    const ledger = db.prepare(
      "SELECT status FROM legacy_imports WHERE source_key LIKE 'custom_providers:%'"
    ).get();
    expect(ledger.status).toBe("imported");
  }));
  it("does not resurrect deleted providers from a stale JSON mirror", () => withSandbox(false, ({ db, stateDir, legacyDir, readSetting }) => {

    db.prepare(`
      INSERT INTO custom_providers (
        id, name, base_url, api_key, protocol, models, enabled, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("current-provider", "Current", "https://current.test", "sk-current", "openai", "[]", 1, Date.now());

    writeJson(stateDir, "custom_providers.json", [
      {
        id: "deleted-provider",
        name: "Deleted before migration",
        baseUrl: "https://deleted.test",
        apiKey: "sk-deleted",
        models: ["deleted-model"],
      },
    ]);

    const report = importLegacyJson(db, stateDir, []);
    expect(report).toHaveLength(1);
    expect(report[0].status).toBe("imported");
    expect(report[0].rowCount).toBe(0);
    expect(report[0].details).toContain("Existing SQLite custom providers were retained");

    const ids = db.prepare("SELECT id FROM custom_providers ORDER BY id").all().map((row: any) => row.id);
    expect(ids).toEqual(["current-provider"]);
  }));
  it("does not merge stale recent usage logs when a canonical SQLite snapshot exists", () => withSandbox(false, ({ db, stateDir, legacyDir, readSetting }) => {

    db.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
    ).run("usage_stats_snapshot", JSON.stringify({ totalRequests: 9, totalTokens: 900, recentLogs: [] }), Date.now());

    writeJson(stateDir, "usage_stats.json", {
      totalRequests: 2,
      totalTokens: 200,
      recentLogs: [
        {
          id: "stale-legacy-log",
          timestamp: "2026-10-31T10:00:00.000Z",
          protocol: "openai",
          model: "stale-model",
          provider: "opencode",
          status: 200,
          latencyMs: 20,
          promptTokens: 100,
          completionTokens: 100,
          totalTokens: 200,
          savedTokens: 0,
          stream: false,
        },
      ],
    });

    const report = importLegacyJson(db, stateDir, []);
    expect(report).toHaveLength(1);
    expect(report[0].details).toContain("Existing SQLite usage snapshot was retained");
    expect(readSetting("usage_stats_snapshot")).toEqual({
      totalRequests: 9,
      totalTokens: 900,
      recentLogs: [],
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM request_logs").get().count).toBe(0);
  }));
  it("imports from the legacy bridge directory when the current state has no source file", () => withSandbox(true, ({ db, stateDir, legacyDir, readSetting }) => {

    writeJson(legacyDir!, "custom_providers.json", [
      {
        id: "old-root-provider",
        name: "Old root provider",
        baseUrl: "https://old.example/v1",
        apiKey: "sk-old",
        models: ["old-model"],
      },
    ]);

    const report = importLegacyJson(db, stateDir, [legacyDir!]);
    expect(report).toHaveLength(1);
    expect(report[0].status).toBe("imported");
    expect(db.prepare("SELECT id FROM custom_providers WHERE id = ?").get("old-root-provider")).toBeDefined();
  }));
});
