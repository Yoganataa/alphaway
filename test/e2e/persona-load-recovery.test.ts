/**
 * Persona global exclusions are a full-replacement write and must not be saved from an unavailable snapshot.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Persona configuration load recovery", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20161);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("blocks full-list exclusion writes until the complete Persona state is loaded and fresh", async () => {
    const { page, baseURL } = dashboard;
    let reads = 0;
    let writes = 0;
    let lastWrite: { excludes?: unknown } | null = null;
    let signalHeldRefresh!: () => void;
    const heldRefresh = new Promise<void>((resolve) => {
      signalHeldRefresh = resolve;
    });
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    const state = (name: string) => ({
      ok: true,
      presets: [{
        id: "protected-persona",
        name,
        prompt: "Keep the existing Persona fixture",
        kind: "PERSONA",
        source: "E2E fixture",
        keywords: [{ text: "fixture-model", mode: "word" }],
        excludes: [],
        order: 1,
        usageCount: 0,
        createdAt: "2026-11-04T00:00:00.000Z",
        updatedAt: "2026-11-04T00:00:00.000Z",
      }],
      bindings: [{
        modelId: "provider/fixture-model",
        enabled: true,
        presetId: "protected-persona",
        updatedAt: "2026-11-04T00:00:00.000Z",
      }],
      excludes: [{ text: "protected-marker", mode: "word" }],
    });

    try {
      // Dashboard bootstrap does not load the Persona page; register before its lazy mount.
      await page.goto(baseURL + "/");

      await page.route("**/api/persona**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();

        if (url.pathname === "/api/persona" && method === "GET") {
          reads += 1;
          if (reads === 1) {
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Simulated Persona state outage" }),
            });
            return;
          }
          if (reads === 2) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ presets: {}, bindings: [], excludes: [] }),
            });
            return;
          }
          if (reads === 3) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                ...state("Malformed Nested Persona"),
                excludes: [{ text: "   ", mode: "word" }],
              }),
            });
            return;
          }
          if (reads === 4) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(state("Protected Persona")),
            });
            return;
          }
          if (reads === 5) {
            signalHeldRefresh();
            await refreshGate;
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Simulated Persona refresh outage" }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(state("Recovered Persona")),
          });
          return;
        }

        if (url.pathname === "/api/persona/excludes" && method === "PUT") {
          writes += 1;
          const payload = request.postDataJSON() as { excludes?: unknown };
          lastWrite = payload;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, excludes: payload.excludes }),
          });
          return;
        }

        await route.continue();
      });

      await page.getByRole("button", { name: "Persona" }).click();

      const loadError = page.locator("#persona-load-error");
      await loadError.waitFor({ state: "visible", timeout: 10000 });
      expect(await loadError.textContent()).toContain("Simulated Persona state outage");
      expect(await page.locator("#persona-unavailable").isVisible()).toBe(true);
      expect(await page.locator("#persona-global-excludes").count()).toBe(0);
      expect(await page.locator("#persona-save-global-excludes").count()).toBe(0);
      expect(writes).toBe(0);

      await page.locator("#persona-load-retry").click();
      await page.getByText("Invalid Persona response", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      expect(await page.locator("#persona-unavailable").isVisible()).toBe(true);
      expect(await page.locator("#persona-save-global-excludes").count()).toBe(0);
      expect(writes).toBe(0);

      // A syntactically valid top-level response with a blank nested exclusion
      // must also fail closed rather than becoming an empty draft.
      await page.locator("#persona-load-retry").click();
      await page.getByText("Invalid Persona response", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      expect(await page.locator("#persona-save-global-excludes").count()).toBe(0);
      expect(writes).toBe(0);

      await page.locator("#persona-load-retry").click();
      await page.getByText("Protected Persona", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await loadError.waitFor({ state: "detached", timeout: 10000 });
      expect(await page.locator("#persona-global-excludes").inputValue()).toBe("protected-marker");
      expect(await page.locator("#persona-save-global-excludes").isEnabled()).toBe(true);

      await page.locator("#persona-refresh").click();
      await heldRefresh;
      await page.locator("#persona-refreshing").waitFor({ state: "visible", timeout: 5000 });
      expect(await page.locator("#persona-global-excludes").isDisabled()).toBe(true);
      expect(await page.locator("#persona-save-global-excludes").isDisabled()).toBe(true);
      expect(await page.locator("#persona-new-preset").isDisabled()).toBe(true);
      expect(writes).toBe(0);

      releaseRefresh();
      await loadError.waitFor({ state: "visible", timeout: 10000 });
      expect(await loadError.textContent()).toContain("last successful snapshot");
      expect(await loadError.textContent()).toContain("Simulated Persona refresh outage");
      expect(await page.getByText("Protected Persona", { exact: true }).isVisible()).toBe(true);
      expect(await page.locator("#persona-global-excludes").inputValue()).toBe("protected-marker");
      expect(await page.locator("#persona-save-global-excludes").isDisabled()).toBe(true);
      expect(await page.locator("#persona-new-preset").isDisabled()).toBe(true);
      expect(writes).toBe(0);

      await page.locator("#persona-load-retry").click();
      await page.getByText("Recovered Persona", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await loadError.waitFor({ state: "detached", timeout: 10000 });
      expect(await page.locator("#persona-save-global-excludes").isEnabled()).toBe(true);

      await page.locator("#persona-global-excludes").fill("protected-marker\nnew-sensitive-marker");
      await page.locator("#persona-save-global-excludes").click();
      await page.getByText("Global Persona exclusions saved", { exact: true }).waitFor({ state: "visible", timeout: 10000 });

      expect(reads).toBe(6);
      expect(writes).toBe(1);
      expect(Array.isArray(lastWrite?.excludes)).toBe(true);
      const saved = lastWrite?.excludes as Array<{ text: string; mode?: string }>;
      expect(saved.some((item) => item.text === "protected-marker")).toBe(true);
      expect(saved.some((item) => item.text === "new-sensitive-marker")).toBe(true);
    } finally {
      releaseRefresh();
      await page.unroute("**/api/persona**");
    }
  }, 30000);
});
