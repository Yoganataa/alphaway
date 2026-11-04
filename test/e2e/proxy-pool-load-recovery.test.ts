/**
 * Proxy pool configuration must be read successfully before the dashboard
 * allows full-list updates that could otherwise overwrite persisted entries.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Proxy pool configuration load recovery", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20156);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("blocks pool writes after initial load failure and preserves the last snapshot after a failed refresh", async () => {
    const { page, baseURL } = dashboard;
    let statusReads = 0;
    let configWrites = 0;
    let poolProbes = 0;
    let signalRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      signalRefreshStarted = resolve;
    });
    let releaseStatusRefresh!: () => void;
    const statusRefreshGate = new Promise<void>((resolve) => {
      releaseStatusRefresh = resolve;
    });

    const statusPayload = (label: string) => ({
      mode: "pool",
      proxy: null,
      hasCredentials: false,
      source: "database",
      locked: false,
      configPath: "/tmp/alphaway-e2e/alphaway.sqlite",
      error: null,
      pool: {
        active: true,
        size: 1,
        enabled: 1,
        ready: 1,
        cooling: 0,
        strategy: "round-robin",
        source: "database",
        cooldownMs: 0,
        maxCooldownMs: 60000,
        error: null,
        entries: [{
          id: "proxy-existing",
          label,
          host: "proxy.example:8080",
          kind: "http",
          enabled: true,
          weight: 1,
          state: "ready",
          cooldownMsLeft: 0,
          cooldownUntil: 0,
          failures: 0,
          lastError: null,
          lastOkAt: null,
          lastUsedAt: null,
        }],
      },
    });

    try {
      await page.route("**/api/proxy/pool/test", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      poolProbes += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          entries: [{
            id: "proxy-existing",
            label: "Existing primary",
            host: "proxy.example:8080",
            ok: true,
            latencyMs: 24,
            state: "ready",
          }],
        }),
      });
    });

    await page.route("**/api/proxy", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        statusReads += 1;
        if (statusReads === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Simulated proxy configuration outage" }),
          });
          return;
        }
        if (statusReads === 2) {
          const malformed = statusPayload("Malformed response");
          (malformed.pool.entries as unknown[])[0] = null;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(malformed),
          });
          return;
        }
        if (statusReads === 4) {
          signalRefreshStarted();
          await statusRefreshGate;
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Simulated proxy configuration outage" }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(statusPayload(statusReads === 5 ? "Recovered primary" : "Existing primary")),
        });
        return;
      }
      if (method === "POST") {
        configWrites += 1;
      }
      await route.continue();
    });

    await page.goto(`${baseURL}/`);
    await page.getByRole("button", { name: "Proxy Pools" }).click();

    const loadError = page.locator("#proxy-config-load-error");
    await loadError.waitFor({ state: "visible", timeout: 10000 });
    expect(await loadError.textContent()).toContain("Simulated proxy configuration outage");
    expect(await loadError.textContent()).toContain("Changes are blocked");
    expect(await page.locator("#proxy-pool-unavailable").isVisible()).toBe(true);
    expect(await page.locator("#proxy-add-node").isDisabled()).toBe(true);
    expect(await page.locator("#proxy-bulk-import").isDisabled()).toBe(true);
    expect(await page.locator("#proxy-save-btn").isDisabled()).toBe(true);

    await page.locator("#proxy-config-retry").click();
    await loadError.waitFor({ state: "visible", timeout: 10000 });
    expect(await loadError.textContent()).toContain("Invalid proxy configuration response");
    expect(await page.locator("#proxy-pool-unavailable").isVisible()).toBe(true);
    expect(await page.locator("#proxy-add-node").isDisabled()).toBe(true);

    await page.locator("#proxy-config-retry").click();
    await page.getByText("Existing primary", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    expect(await loadError.count()).toBe(0);
    expect(await page.locator("#proxy-add-node").isEnabled()).toBe(true);

    // A probe refresh is held open to prove writes remain disabled while its
    // persisted configuration read is in flight.
    await page.getByRole("button", { name: "Ping All" }).click();
    await refreshStarted;
    expect(await page.locator("#proxy-add-node").isDisabled()).toBe(true);
    expect(await page.locator("#proxy-bulk-import").isDisabled()).toBe(true);
    expect(await page.locator("#proxy-save-btn").isDisabled()).toBe(true);
    releaseStatusRefresh();
    await loadError.waitFor({ state: "visible", timeout: 10000 });
    expect(await loadError.textContent()).toContain("last successful snapshot");
    expect(await loadError.textContent()).toContain("Simulated proxy configuration outage");
    expect(await page.getByText("Existing primary", { exact: true }).isVisible()).toBe(true);
    expect(await page.locator("#proxy-add-node").isDisabled()).toBe(true);
    expect(await page.locator("#proxy-bulk-import").isDisabled()).toBe(true);
    expect(await page.locator("#proxy-save-btn").isDisabled()).toBe(true);

    await page.locator("#proxy-config-retry").click();
    await page.getByText("Recovered primary", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    expect(await loadError.count()).toBe(0);
    expect(await page.locator("#proxy-add-node").isEnabled()).toBe(true);
    expect(statusReads).toBe(5);
    expect(poolProbes).toBe(1);
    expect(configWrites).toBe(0);

    await page.unroute("**/api/proxy/pool/test");
    await page.unroute("**/api/proxy");
    } finally {
      releaseStatusRefresh();
    }
  }, 25000);
});
