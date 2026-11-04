/**
 * Security Rules full-replacement writes must never run against an unavailable or stale snapshot.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Security Rules configuration load recovery", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20159);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("blocks destructive full-list writes until the canonical rules snapshot is loaded and fresh", async () => {
    const { page, baseURL } = dashboard;
    let reads = 0;
    let writes = 0;
    let lastWrite: { rules?: unknown } | null = null;
    let signalHeldRefresh!: () => void;
    const heldRefresh = new Promise<void>((resolve) => {
      signalHeldRefresh = resolve;
    });
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    const rule = (description: string) => ({
      id: "critical-existing",
      pattern: "production_credential_marker",
      action: "block" as const,
      description,
      enabled: true,
    });

    try {
      await page.route("**/api/security/rules", async (route) => {
        const method = route.request().method();
        if (method === "PUT") {
          writes += 1;
          const payload = route.request().postDataJSON() as { rules?: unknown };
          lastWrite = payload;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, rules: payload.rules }),
          });
          return;
        }
        if (method !== "GET") {
          await route.continue();
          return;
        }

        reads += 1;
        if (reads === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Simulated Security Rules outage" }),
          });
          return;
        }
        if (reads === 2) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ rules: {} }),
          });
          return;
        }
        if (reads === 3) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ rules: [rule("Original persisted fixture")] }),
          });
          return;
        }
        if (reads === 4) {
          signalHeldRefresh();
          await refreshGate;
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Simulated Security Rules refresh outage" }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ rules: [rule("Recovered persisted fixture")] }),
        });
      });

      await page.goto(baseURL + "/");
      await page.getByRole("button", { name: "Security" }).click();

      const loadError = page.locator("#security-rules-load-error");
      const addRule = page.locator("#security-rules-add");
      await loadError.waitFor({ state: "visible", timeout: 10000 });
      expect(await loadError.textContent()).toContain("Simulated Security Rules outage");
      expect(await page.locator("#security-rules-unavailable").isVisible()).toBe(true);
      expect(await page.locator("#security-rules-empty").count()).toBe(0);
      expect(await addRule.isDisabled()).toBe(true);
      expect(writes).toBe(0);

      await page.locator("#security-rules-load-retry-btn").click();
      await page.getByText("Invalid Security Rules response", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      expect(await addRule.isDisabled()).toBe(true);
      expect(writes).toBe(0);

      await page.locator("#security-rules-load-retry-btn").click();
      const existingRow = page.locator("#security-rule-row-critical-existing");
      await existingRow.getByText("Original persisted fixture", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await loadError.waitFor({ state: "detached", timeout: 10000 });
      expect(await addRule.isEnabled()).toBe(true);

      await page.locator("#security-rules-refresh").click();
      await heldRefresh;
      await page.getByRole("button", { name: "Refreshing…" }).waitFor({ state: "visible", timeout: 5000 });
      expect(await addRule.isDisabled()).toBe(true);
      expect(await existingRow.getByRole("switch", { name: "Enable rule critical-existing" }).isDisabled()).toBe(true);
      expect(await page.locator("#security-rules-delete-critical-existing").isDisabled()).toBe(true);
      expect(writes).toBe(0);

      releaseRefresh();
      await loadError.waitFor({ state: "visible", timeout: 10000 });
      expect(await loadError.textContent()).toContain("last successful snapshot");
      expect(await loadError.textContent()).toContain("Simulated Security Rules refresh outage");
      expect(await existingRow.getByText("Original persisted fixture", { exact: true }).isVisible()).toBe(true);
      expect(await addRule.isDisabled()).toBe(true);
      expect(await existingRow.getByRole("switch", { name: "Enable rule critical-existing" }).isDisabled()).toBe(true);
      expect(await page.locator("#security-rules-delete-critical-existing").isDisabled()).toBe(true);
      expect(writes).toBe(0);

      await page.locator("#security-rules-load-retry-btn").click();
      await existingRow.getByText("Recovered persisted fixture", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await loadError.waitFor({ state: "detached", timeout: 10000 });
      expect(await addRule.isEnabled()).toBe(true);

      await addRule.click();
      await page.getByRole("heading", { name: "Add Custom Security Guardrail", exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await page.locator("#pattern-input").fill("new_sensitive_marker");
      await page.locator("#desc-input").fill("Regression rule");
      await page.getByRole("button", { name: "Save Rule" }).click();

      await page.locator("#security-rule-row-critical-existing").getByText("Recovered persisted fixture", { exact: true })
        .waitFor({ state: "visible", timeout: 10000 });
      await page.getByText("new_sensitive_marker", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      expect(writes).toBe(1);
      expect(Array.isArray(lastWrite?.rules)).toBe(true);
      expect((lastWrite?.rules as Array<{ id: string }>).some((item) => item.id === "critical-existing")).toBe(true);
      expect((lastWrite?.rules as Array<{ pattern: string }>).some((item) => item.pattern === "new_sensitive_marker")).toBe(true);
      expect(reads).toBe(5);
    } finally {
      releaseRefresh();
      await page.unroute("**/api/security/rules");
    }
  }, 30000);
});
