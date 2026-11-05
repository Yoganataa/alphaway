/**
 * Aggregate Usage loading must never present failed reads as zero usage or
 * allow destructive actions against unavailable/stale data.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Usage aggregate load recovery", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20160);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("validates the summary, preserves stale data, and blocks reset/clear until recovery", async () => {
    const { page, baseURL } = dashboard;
    let reads = 0;
    let writes = 0;
    let signalHeldRefresh!: () => void;
    const heldRefresh = new Promise<void>((resolve) => {
      signalHeldRefresh = resolve;
    });
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    const breakdown = (requests: number, tokens: number) => ({
      requests,
      tokens,
      promptTokens: tokens,
      completionTokens: 0,
      lastUsed: requests > 0 ? "2026-11-05T03:00:00.000Z" : "",
    });

    const stats = (model: string | null) => {
      const hasUsage = model !== null;
      const recentLogs = hasUsage
        ? [{
            id: "usage-load-recovery-log",
            timestamp: "2026-11-05T03:00:00.000Z",
            protocol: "openai" as const,
            model,
            provider: "opencode" as const,
            status: 200,
            latencyMs: 25,
            promptTokens: 12,
            completionTokens: 8,
            totalTokens: 20,
            savedTokens: 2,
            stream: false,
            clientApiKeyId: null,
          }]
        : [];
      return {
        totalRequests: hasUsage ? 1 : 0,
        successfulRequests: hasUsage ? 1 : 0,
        failedRequests: 0,
        totalPromptTokens: hasUsage ? 12 : 0,
        totalCompletionTokens: hasUsage ? 8 : 0,
        totalTokens: hasUsage ? 20 : 0,
        savedTokens: hasUsage ? 2 : 0,
        estimatedSavingsUsd: hasUsage ? 0.05 : 0,
        byModel: hasUsage ? {
          [model]: {
            requests: 1,
            promptTokens: 12,
            completionTokens: 8,
            totalTokens: 20,
            lastUsed: "2026-11-05T03:00:00.000Z",
          },
        } : {},
        byProtocol: {
          openai: breakdown(hasUsage ? 1 : 0, hasUsage ? 20 : 0),
          anthropic: breakdown(0, 0),
          responses: breakdown(0, 0),
        },
        byProvider: {
          opencode: breakdown(hasUsage ? 1 : 0, hasUsage ? 20 : 0),
          codebuddy: breakdown(0, 0),
          custom: breakdown(0, 0),
        },
        dailyHistory: {},
        hourlyHistory: {},
        recentLogs,
      };
    };

    try {
      await page.route("**/api/usage**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname === "/api/usage" && request.method() === "GET") {
          reads += 1;
          if (reads === 1) {
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Temporary aggregate Usage outage" }),
            });
            return;
          }
          if (reads === 2) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ totalRequests: 0 }),
            });
            return;
          }
          if (reads === 3) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(stats(null)),
            });
            return;
          }
          if (reads === 4) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(stats("existing-usage-model")),
            });
            return;
          }
          if (reads === 5) {
            signalHeldRefresh();
            await refreshGate;
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Temporary aggregate Usage refresh failure" }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(stats("recovered-usage-model")),
          });
          return;
        }

        if (
          url.pathname === "/api/usage/reset" ||
          url.pathname === "/api/usage/clear-logs"
        ) {
          writes += 1;
          await route.continue();
          return;
        }
        await route.continue();
      });

      await page.goto(baseURL + "/");
      const chartRequest = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return url.pathname === "/api/usage/chart" && url.searchParams.get("period") === "7d";
      });
      await page.getByRole("button", { name: "Usage" }).click();

      const loadError = page.locator("#usage-load-error");
      const reset = page.locator("#usage-reset-stats");
      const clearLogs = page.getByRole("button", { name: "Clear Logs" });
      await loadError.waitFor({ state: "visible", timeout: 10000 });
      expect(await loadError.textContent()).toContain("Temporary aggregate Usage outage");
      expect(await page.locator("#usage-unavailable").isVisible()).toBe(true);
      expect(await page.getByText("Total Requests", { exact: true }).count()).toBe(0);
      expect(await reset.isDisabled()).toBe(true);
      expect(await clearLogs.isDisabled()).toBe(true);
      expect(writes).toBe(0);

      await page.locator("#usage-load-retry").click();
      await page.getByText("Invalid usage stats response", { exact: true })
        .waitFor({ state: "visible", timeout: 10000 });
      expect(await page.getByText("Total Requests", { exact: true }).count()).toBe(0);
      expect(await reset.isDisabled()).toBe(true);

      await page.locator("#usage-load-retry").click();
      await page.getByText("No requests recorded yet.", { exact: true })
        .waitFor({ state: "visible", timeout: 10000 });
      await page.getByText("Total Requests", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await loadError.waitFor({ state: "detached", timeout: 10000 });
      const chart = await chartRequest;
      expect(new URL(chart.url()).searchParams.get("period")).toBe("7d");

      await page.locator("#usage-refresh").click();
      await page.getByText("existing-usage-model", { exact: true })
        .waitFor({ state: "visible", timeout: 10000 });
      expect(await reset.isEnabled()).toBe(true);

      await page.locator("#usage-refresh").click();
      await heldRefresh;
      await page.locator("#usage-refreshing").waitFor({ state: "visible", timeout: 5000 });
      expect(await reset.isDisabled()).toBe(true);
      expect(await clearLogs.isDisabled()).toBe(true);
      expect(writes).toBe(0);

      releaseRefresh();
      await loadError.waitFor({ state: "visible", timeout: 10000 });
      expect(await loadError.textContent()).toContain("last successful snapshot");
      expect(await loadError.textContent()).toContain("Temporary aggregate Usage refresh failure");
      expect(await page.getByText("existing-usage-model", { exact: true }).isVisible()).toBe(true);
      expect(await reset.isDisabled()).toBe(true);
      expect(await clearLogs.isDisabled()).toBe(true);
      expect(await loadError.textContent()).toContain("Last successful load:");
      expect(writes).toBe(0);

      await page.locator("#usage-load-retry").click();
      await page.getByText("recovered-usage-model", { exact: true })
        .waitFor({ state: "visible", timeout: 10000 });
      await loadError.waitFor({ state: "detached", timeout: 10000 });
      expect(await reset.isEnabled()).toBe(true);
      expect(await clearLogs.isEnabled()).toBe(true);
      expect(reads).toBe(6);
      expect(writes).toBe(0);
    } finally {
      releaseRefresh();
      await page.unroute("**/api/usage**");
    }
  }, 30000);
});
