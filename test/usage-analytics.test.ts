import { dbGetRequestLogById, dbGetSetting } from "../src/core/database";
/**
 * Usage and Analytics Engine Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { app } from "../src/app";
import {
  recordRequestUsage,
  getUsageStats,
  resetUsageStats,
  clearRecentLogs,
  estimateTokensFromText,
  getUsageChart,
  getActivityHeatmap,
  getRequestLogDetail,
} from "../src/core/usage-tracker";

describe("Usage and Token Analytics Engine", () => {
  beforeEach(() => {
    resetUsageStats();
  });

  it("accurately estimates tokens from text", () => {
    expect(estimateTokensFromText("")).toBe(0);
    expect(estimateTokensFromText("hello")).toBeGreaterThan(0);
    expect(estimateTokensFromText("This is a longer test sentence with code: const x = 42;")).toBeGreaterThan(5);
  });

  it("records request usage and updates summary statistics", () => {
    const entry = recordRequestUsage({
      protocol: "openai",
      model: "mimo-v2.6-flash-free",
      provider: "opencode",
      status: 200,
      latencyMs: 145,
      promptTokens: 120,
      completionTokens: 80,
      savedTokens: 40,
      stream: false,
    });

    expect(entry.id).toStartWith("req_");
    expect(entry.model).toBe("mimo-v2.6-flash-free");
    expect(entry.totalTokens).toBe(200);

    const stats = getUsageStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.successfulRequests).toBe(1);
    expect(stats.failedRequests).toBe(0);
    expect(stats.totalPromptTokens).toBe(120);
    expect(stats.totalCompletionTokens).toBe(80);
    expect(stats.totalTokens).toBe(200);
    expect(stats.savedTokens).toBe(40);
    expect(stats.estimatedSavingsUsd).toBeGreaterThan(0);

    // Protocol breakdown
    expect(stats.byProtocol.openai.requests).toBe(1);
    expect(stats.byProtocol.openai.tokens).toBe(200);

    // Provider breakdown
    expect(stats.byProvider.opencode.requests).toBe(1);
    expect(stats.byProvider.opencode.tokens).toBe(200);

    // Model breakdown
    expect(stats.byModel["mimo-v2.6-flash-free"]).toBeDefined();
    expect(stats.byModel["mimo-v2.6-flash-free"].requests).toBe(1);
    expect(stats.byModel["mimo-v2.6-flash-free"].totalTokens).toBe(200);

    // Request event and aggregate projection are committed together.
    const persistedLog = dbGetRequestLogById(entry.id);
    const persistedSnapshot = dbGetSetting<any>("usage_stats_snapshot", null);
    expect(persistedLog?.totalTokens).toBe(200);
    expect(persistedSnapshot.totalRequests).toBe(1);
    expect(persistedSnapshot.totalTokens).toBe(200);
    expect(persistedSnapshot.recentLogs[0].id).toBe(entry.id);
  });

  it("tracks tri-protocol requests across different providers", () => {
    // Anthropic request
    recordRequestUsage({
      protocol: "anthropic",
      model: "claude-3-5-sonnet",
      provider: "custom",
      status: 200,
      latencyMs: 320,
      promptTokens: 200,
      completionTokens: 150,
      savedTokens: 50,
      stream: true,
    });

    // Responses request (failed)
    recordRequestUsage({
      protocol: "responses",
      model: "gpt-4o",
      provider: "codebuddy",
      status: 500,
      latencyMs: 50,
      promptTokens: 50,
      completionTokens: 0,
      stream: false,
    });

    const stats = getUsageStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.successfulRequests).toBe(1);
    expect(stats.failedRequests).toBe(1);
    expect(stats.byProtocol.anthropic.requests).toBe(1);
    expect(stats.byProtocol.responses.requests).toBe(1);
    expect(stats.byProvider.custom.requests).toBe(1);
    expect(stats.byProvider.codebuddy.requests).toBe(1);
    expect(stats.recentLogs.length).toBe(2);
  });

  it("exposes usage stats via /api/usage REST endpoint", async () => {
    recordRequestUsage({
      protocol: "openai",
      model: "big-pickle",
      provider: "opencode",
      status: 200,
      latencyMs: 100,
      promptTokens: 60,
      completionTokens: 40,
    });

    const res = await app.request("/api/usage");
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.totalRequests).toBe(1);
    expect(json.totalTokens).toBe(100);
    expect(json.recentLogs.length).toBe(1);
  });

  it("generates bucketed usage chart data and exposes via REST API", async () => {
    recordRequestUsage({
      protocol: "openai",
      model: "glm-5.3-flash-free",
      provider: "opencode",
      status: 200,
      latencyMs: 120,
      promptTokens: 100,
      completionTokens: 50,
    });

    const chart7d = getUsageChart("7d");
    expect(chart7d.length).toBe(7);
    expect(chart7d[chart7d.length - 1].tokens).toBe(150);

    const chart24h = getUsageChart("24h");
    expect(chart24h.length).toBe(24);

    const res = await app.request("/api/usage/chart?period=7d");
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(7);
  });

  it("calculates activity heatmap and streaks", async () => {
    recordRequestUsage({
      protocol: "openai",
      model: "test-model",
      provider: "opencode",
      status: 200,
      latencyMs: 50,
      promptTokens: 10,
      completionTokens: 20,
    });

    const heatmap = getActivityHeatmap(14);
    expect(heatmap.daily.length).toBe(14);
    expect(heatmap.streak).toBeGreaterThanOrEqual(1);

    const res = await app.request("/api/usage/heatmap?days=14");
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.daily.length).toBe(14);
    expect(json.streak).toBeGreaterThanOrEqual(1);
  });

  it("retrieves individual request details by id", async () => {
    const entry = recordRequestUsage({
      protocol: "anthropic",
      model: "claude-test",
      provider: "custom",
      status: 200,
      latencyMs: 110,
      promptTokens: 25,
      completionTokens: 75,
    });

    const detail = getRequestLogDetail(entry.id);
    expect(detail).toBeDefined();
    expect(detail?.model).toBe("claude-test");

    const res = await app.request(`/api/usage/details/${entry.id}`);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.id).toBe(entry.id);
    expect(json.totalTokens).toBe(100);

    const notFound = await app.request("/api/usage/details/req_nonexistent");
    expect(notFound.status).toBe(404);
  });

  it("clears logs and resets usage correctly", async () => {
    recordRequestUsage({
      protocol: "openai",
      model: "test-model",
      provider: "opencode",
      status: 200,
      latencyMs: 80,
      promptTokens: 10,
      completionTokens: 10,
    });

    const clearRes = await app.request("/api/usage/clear-logs", { method: "POST" });
    expect(clearRes.status).toBe(200);
    expect(getUsageStats().recentLogs.length).toBe(0);
    expect(getUsageStats().totalRequests).toBe(1);

    const resetRes = await app.request("/api/usage/reset", { method: "POST" });
    expect(resetRes.status).toBe(200);
    expect(getUsageStats().totalRequests).toBe(0);
    expect(getUsageStats().totalTokens).toBe(0);
  });
});
