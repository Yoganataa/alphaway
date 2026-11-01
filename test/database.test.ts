/**
 * SQLite Database Engine Unit Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  getDatabase,
  closeDatabase,
  dbLoadCustomProviders,
  dbSaveCustomProvider,
  dbDeleteCustomProvider,
  dbInsertRequestLog,
  dbGetRecentRequestLogs,
  dbGetRequestLogById,
  dbClearRequestLogs,
  dbGetSummaryMetrics,
  dbGetModelSummaries,
  dbGetProviderSummaries,
  dbGetProtocolSummaries,
  dbGetSetting,
  dbSetSetting,
} from "../src/core/database";

describe("AlphaWay SQLite Database Engine", () => {
  beforeEach(() => {
    // Clean tables for each test
    const db = getDatabase();
    db.exec("DELETE FROM custom_providers;");
    db.exec("DELETE FROM request_logs;");
    db.exec("DELETE FROM app_settings;");
  });

  it("initializes SQLite database with WAL mode and tables", () => {
    const db = getDatabase();
    expect(db).toBeDefined();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table';").all().map((r: any) => r.name);
    expect(tables).toContain("custom_providers");
    expect(tables).toContain("request_logs");
    expect(tables).toContain("app_settings");
  });

  it("performs CRUD operations on custom providers", () => {
    const provider = {
      id: "deepseek-test",
      name: "DeepSeek Provider",
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-test-key",
      protocol: "openai" as const,
      models: ["deepseek-chat", "deepseek-coder"],
      enabled: true,
      createdAt: Date.now(),
    };

    dbSaveCustomProvider(provider);

    const list = dbLoadCustomProviders();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe("deepseek-test");
    expect(list[0].name).toBe("DeepSeek Provider");
    expect(list[0].models).toContain("deepseek-chat");

    const deleted = dbDeleteCustomProvider("deepseek-test");
    expect(deleted).toBe(true);
    expect(dbLoadCustomProviders().length).toBe(0);
  });

  it("stores and queries request logs with indexed metrics", () => {
    const entry1 = {
      id: "req_test_01",
      timestamp: new Date().toISOString(),
      protocol: "openai" as const,
      model: "mimo-v2.6-flash-free",
      provider: "opencode" as const,
      status: 200,
      latencyMs: 120,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      savedTokens: 25,
      stream: false,
    };

    const entry2 = {
      id: "req_test_02",
      timestamp: new Date().toISOString(),
      protocol: "anthropic" as const,
      model: "claude-3-7-sonnet",
      provider: "custom" as const,
      status: 500,
      latencyMs: 340,
      promptTokens: 200,
      completionTokens: 0,
      totalTokens: 200,
      savedTokens: 0,
      stream: true,
    };

    dbInsertRequestLog(entry1);
    dbInsertRequestLog(entry2);

    const recent = dbGetRecentRequestLogs(10);
    expect(recent.length).toBe(2);

    const detail = dbGetRequestLogById("req_test_01");
    expect(detail).not.toBeNull();
    expect(detail?.model).toBe("mimo-v2.6-flash-free");
    expect(detail?.totalTokens).toBe(150);

    const metrics = dbGetSummaryMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.successfulRequests).toBe(1);
    expect(metrics.failedRequests).toBe(1);
    expect(metrics.totalTokens).toBe(350);
    expect(metrics.savedTokens).toBe(25);

    const models = dbGetModelSummaries();
    expect(models["mimo-v2.6-flash-free"].requests).toBe(1);
    expect(models["claude-3-7-sonnet"].requests).toBe(1);

    const providers = dbGetProviderSummaries();
    expect(providers.opencode.requests).toBe(1);
    expect(providers.custom.requests).toBe(1);

    const protocols = dbGetProtocolSummaries();
    expect(protocols.openai.requests).toBe(1);
    expect(protocols.anthropic.requests).toBe(1);

    dbClearRequestLogs();
    expect(dbGetRecentRequestLogs().length).toBe(0);
  });

  it("stores and retrieves key-value app settings", () => {
    dbSetSetting("tokensaver_active", { rtk: true, caveman: false });
    const setting = dbGetSetting("tokensaver_active", { rtk: false, caveman: false });
    expect(setting.rtk).toBe(true);
    expect(setting.caveman).toBe(false);

    const missing = dbGetSetting("nonexistent_key", "default_val");
    expect(missing).toBe("default_val");
  });
});
