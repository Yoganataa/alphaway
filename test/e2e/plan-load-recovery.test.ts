/**
 * Plans page load states must distinguish unavailable data from a valid empty list.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Plans configuration load recovery", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20158);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("validates the response, preserves the last successful snapshot, and blocks edits while stale", async () => {
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

    const plan = (name: string) => ({
      id: "plan-e2e-existing",
      name,
      description: "Browser recovery fixture",
      rpmLimit: 10,
      tpmLimit: 1000,
      concurrencyLimit: 2,
      tokenQuota: 5000,
      allowedModels: ["e2e-model-*"],
      createdAt: 1793793600000,
      updatedAt: 1793793600000,
    });

    try {
      // Let dashboard bootstrap finish before intercepting the Plans page's first read.
      // Other mounted dashboard components may query Plans independently during startup.
      await page.goto(baseURL + "/");

      await page.route("**/api/plans", async (route) => {
        const method = route.request().method();
        if (method !== "GET") {
          writes += 1;
          await route.continue();
          return;
        }

        reads += 1;
        if (reads === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Simulated Plans outage" }),
          });
          return;
        }
        if (reads === 2) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ plans: {} }),
          });
          return;
        }
        if (reads === 3) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ plans: [] }),
          });
          return;
        }
        if (reads === 4) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ plans: [plan("Existing Starter")] }),
          });
          return;
        }
        if (reads === 5) {
          signalHeldRefresh();
          await refreshGate;
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Simulated Plans refresh outage" }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ plans: [plan("Recovered Starter")] }),
        });
      });

      await page.getByRole("button", { name: "Plans" }).click();

      const loadError = page.locator("#plans-load-error");
      const submit = page.locator("#plans-submit");
      await loadError.waitFor({ state: "visible", timeout: 10000 });
      expect(await loadError.textContent()).toContain("Simulated Plans outage");
      expect(await page.getByText("No Plans yet.", { exact: false }).count()).toBe(0);
      expect(await submit.isDisabled()).toBe(true);

      await page.locator("#plans-load-retry").click();
      await page.getByText("Invalid Plans response", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      expect(await page.getByText("No Plans yet.", { exact: false }).count()).toBe(0);

      await page.locator("#plans-load-retry").click();
      await page.getByText("No Plans yet. Create a reusable policy to assign to managed API keys.", { exact: true })
        .waitFor({ state: "visible", timeout: 10000 });
      await loadError.waitFor({ state: "detached", timeout: 10000 });
      expect(await submit.isDisabled()).toBe(true);

      await page.getByLabel("Name", { exact: true }).fill("Draft while refreshing");
      await page.locator("#plans-refresh").click();
      await page.getByRole("heading", { name: "Existing Starter", exact: true }).waitFor({ state: "visible", timeout: 10000 });

      await page.locator("#plans-refresh").click();
      await heldRefresh;
      await page.locator("#plans-refreshing").waitFor({ state: "visible", timeout: 5000 });
      expect(await submit.isDisabled()).toBe(true);

      releaseRefresh();
      await loadError.waitFor({ state: "visible", timeout: 10000 });
      expect(await loadError.textContent()).toContain("last successful snapshot");
      expect(await loadError.textContent()).toContain("Simulated Plans refresh outage");
      expect(await page.getByRole("heading", { name: "Existing Starter", exact: true }).isVisible()).toBe(true);
      expect(await page.locator("article").filter({ hasText: "Existing Starter" }).getByRole("button", { name: "Edit" }).isDisabled()).toBe(true);
      expect(await submit.isDisabled()).toBe(true);

      await page.locator("#plans-load-retry").click();
      await page.getByRole("heading", { name: "Recovered Starter", exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await loadError.waitFor({ state: "detached", timeout: 10000 });
      expect(await page.locator("article").filter({ hasText: "Recovered Starter" }).getByRole("button", { name: "Edit" }).isEnabled()).toBe(true);
      expect(await submit.isEnabled()).toBe(true);
      expect(reads).toBe(6);
      expect(writes).toBe(0);
    } finally {
      releaseRefresh();
      await page.unroute("**/api/plans");
    }
  }, 30000);
});
