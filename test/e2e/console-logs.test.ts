/**
 * Console log polling and recovery UI regressions.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Console log dashboard recovery", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20151);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("distinguishes initial load failure from empty logs and retains the last snapshot on poll failure", async () => {
    const { page, baseURL } = dashboard;
    let getAttempts = 0;

    await page.route("**/api/console-logs", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      getAttempts += 1;
      if (getAttempts === 1 || getAttempts === 3) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary console read failure" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          logs: [{
            seq: 9001,
            time: "14:00:00.000",
            level: "info",
            line: "E2E console poll recovered",
          }],
        }),
      });
    });

    await page.goto(`${baseURL}/`);
    await page.getByRole("button", { name: "Console Log" }).click();

    const refreshError = page.locator("#console-log-refresh-error");
    await refreshError.waitFor({ state: "visible", timeout: 10000 });
    expect(await refreshError.textContent()).toContain("Temporary console read failure");
    expect(await page.getByText("Console buffer unavailable.", { exact: false }).isVisible()).toBe(true);

    await page.getByRole("button", { name: "Retry Load" }).click();
    const marker = page.getByText("E2E console poll recovered", { exact: true });
    await marker.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(() => {
      const status = document.querySelector("#console-log-poll-status");
      return Boolean(status?.textContent?.includes("Polling"));
    }, undefined, { timeout: 8000 });
    expect(await refreshError.count()).toBe(0);

    // The periodic poll fails after a successful read. The last successful
    // snapshot must remain visible and be explicitly identified as stale.
    await refreshError.waitFor({ state: "visible", timeout: 10000 });
    expect(await refreshError.textContent()).toContain("Showing the last successful buffer");
    expect(await marker.isVisible()).toBe(true);
    expect(await page.locator("#console-log-poll-status").textContent()).toContain("Refresh failed");

    await page.getByRole("button", { name: "Retry Load" }).click();
    await marker.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(() => {
      const status = document.querySelector("#console-log-poll-status");
      return Boolean(status?.textContent?.includes("Polling"));
    }, undefined, { timeout: 8000 });
    expect(await refreshError.count()).toBe(0);
    expect(getAttempts).toBeGreaterThanOrEqual(4);

    await page.unroute("**/api/console-logs");
  }, 25000);
});
