/**
 * Profile & Settings database diagnostics recovery regressions.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Profile settings database diagnostics recovery", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20152);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("shows the initial stats error, retries, and retains the last successful snapshot after a refresh failure", async () => {
    const { page, baseURL } = dashboard;
    let statsRequests = 0;

    const statsResponse = (sizeKb: number) => ({
      engine: "Bun SQLite (native)",
      mode: "WAL (Write-Ahead Logging)",
      path: "/tmp/alphaway-e2e/alphaway.sqlite",
      sizeKb,
      requestLogsCount: 12,
      customProvidersCount: 2,
      reclaimableBytes: 1024,
      journalMode: "wal",
      busyTimeoutMs: 5000,
    });

    await page.route("**/api/settings/database/stats", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      statsRequests += 1;
      if (statsRequests === 1 || statsRequests === 3) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary database stats failure" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(statsResponse(statsRequests >= 4 ? 4321 : 4242)),
      });
    });

    await page.route("**/api/settings/database/vacuum", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, message: "Database vacuum completed" }),
      });
    });

    await page.goto(`${baseURL}/`);
    await page.getByRole("button", { name: "Profile & Settings" }).click();

    const statsError = page.locator("#database-stats-load-error");
    await statsError.waitFor({ state: "visible", timeout: 10000 });
    expect(await statsError.textContent()).toContain("Temporary database stats failure");
    expect(await statsError.textContent()).toContain("Database statistics could not be loaded");

    await page.getByRole("button", { name: "Retry Load" }).click();
    await page.getByText("Bun SQLite (native)", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("4,242 KB", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    expect(await statsError.count()).toBe(0);

    // Vacuum succeeds, but the following diagnostics refresh fails. Previously
    // this path discarded dbStats and replaced valid metrics with "Unavailable".
    await page.getByRole("button", { name: "Vacuum & Re-Index" }).click();
    await statsError.waitFor({ state: "visible", timeout: 10000 });
    expect(await statsError.textContent()).toContain("Showing the last successful snapshot");
    expect(await statsError.textContent()).toContain("Temporary database stats failure");
    await page.getByText("4,242 KB", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Stale Data", { exact: true }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Retry Load" }).click();
    await page.getByText("4,321 KB", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    expect(await statsError.count()).toBe(0);
    expect(statsRequests).toBe(4);

    await page.unroute("**/api/settings/database/stats");
    await page.unroute("**/api/settings/database/vacuum");
  }, 20000);
});
