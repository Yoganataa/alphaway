/**
 * Providers must distinguish unavailable model/provider data from valid empty results.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Providers configuration load recovery", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20160);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("validates model/provider responses, preserves stale provider rows, and blocks writes until recovery", async () => {
    const { page, baseURL } = dashboard;
    let modelReads = 0;
    let providerReads = 0;
    let writes = 0;
    let signalHeldRefresh!: () => void;
    const heldRefresh = new Promise<void>((resolve) => {
      signalHeldRefresh = resolve;
    });
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    const model = (id: string) => ({
      id,
      object: "model",
      created: 1793793600,
      owned_by: "opencode",
    });
    const provider = (name: string) => ({
      id: "provider-e2e",
      name,
      baseUrl: "https://api.example.test/v1",
      apiKey: "",
      hasApiKey: true,
      protocol: "openai",
      models: ["example-model"],
      enabled: true,
    });

    try {
      // Register after dashboard bootstrap so only the Providers page reads consume the fixtures.
      await page.goto(baseURL + "/");

      await page.route("**/v1/models", async (route) => {
        modelReads += 1;
        if (modelReads === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Simulated model catalog outage" }),
          });
          return;
        }
        if (modelReads === 2) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ object: "list", data: {} }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ object: "list", data: [model("opencode-fixture-free")] }),
        });
      });

      await page.route("**/api/custom-providers", async (route) => {
        if (route.request().method() !== "GET") {
          writes += 1;
          await route.continue();
          return;
        }

        providerReads += 1;
        if (providerReads === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Simulated custom providers outage" }),
          });
          return;
        }
        if (providerReads === 2) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ providers: {} }),
          });
          return;
        }
        if (providerReads === 3) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ providers: [provider("Existing Provider")] }),
          });
          return;
        }
        if (providerReads === 4) {
          signalHeldRefresh();
          await refreshGate;
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Simulated custom provider refresh outage" }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ providers: [provider("Recovered Provider")] }),
        });
      });

      await page.getByRole("button", { name: "Providers" }).click();

      const modelsError = page.locator("#providers-models-load-error");
      const providersError = page.locator("#providers-config-load-error");
      const addProvider = page.locator("#providers-add");

      await modelsError.waitFor({ state: "visible", timeout: 10000 });
      await providersError.waitFor({ state: "visible", timeout: 10000 });
      expect(await modelsError.textContent()).toContain("Simulated model catalog outage");
      expect(await providersError.textContent()).toContain("Simulated custom providers outage");
      expect(await addProvider.isDisabled()).toBe(true);
      expect(await page.getByText("The model catalog is unavailable. Retry the load above.", { exact: true }).isVisible()).toBe(true);
      expect(await page.locator("#providers-config-empty").count()).toBe(0);
      expect(writes).toBe(0);

      await page.locator("#providers-models-retry").click();
      await page.getByText("Invalid models response", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      expect(await page.getByText("The model catalog is unavailable. Retry the load above.", { exact: true }).isVisible()).toBe(true);

      await page.locator("#providers-config-retry").click();
      await page.getByText("Invalid custom providers response", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      expect(await addProvider.isDisabled()).toBe(true);
      expect(writes).toBe(0);

      await page.locator("#providers-models-retry").click();
      await page.getByText("opencode-fixture-free", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await modelsError.waitFor({ state: "detached", timeout: 10000 });

      await page.locator("#providers-config-retry").click();
      const existingRow = page.locator("#custom-provider-row-provider-e2e");
      await existingRow.getByText("Existing Provider", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await providersError.waitFor({ state: "detached", timeout: 10000 });
      expect(await addProvider.isEnabled()).toBe(true);

      await page.locator("#providers-config-refresh").click();
      await heldRefresh;
      await page.locator("#providers-config-refreshing").waitFor({ state: "visible", timeout: 5000 });
      expect(await addProvider.isDisabled()).toBe(true);
      expect(await existingRow.getByRole("button", { name: "Edit" }).isDisabled()).toBe(true);
      expect(await existingRow.getByRole("button", { name: "Delete" }).isDisabled()).toBe(true);
      expect(writes).toBe(0);

      releaseRefresh();
      await providersError.waitFor({ state: "visible", timeout: 10000 });
      expect(await providersError.textContent()).toContain("last successful snapshot");
      expect(await providersError.textContent()).toContain("Simulated custom provider refresh outage");
      expect(await existingRow.getByText("Existing Provider", { exact: true }).isVisible()).toBe(true);
      expect(await addProvider.isDisabled()).toBe(true);
      expect(await existingRow.getByRole("button", { name: "Edit" }).isDisabled()).toBe(true);
      expect(await existingRow.getByRole("button", { name: "Delete" }).isDisabled()).toBe(true);
      expect(writes).toBe(0);

      await page.locator("#providers-config-retry").click();
      await existingRow.getByText("Recovered Provider", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      await providersError.waitFor({ state: "detached", timeout: 10000 });
      expect(await addProvider.isEnabled()).toBe(true);
      expect(modelReads).toBe(3);
      expect(providerReads).toBe(5);
      expect(writes).toBe(0);
    } finally {
      releaseRefresh();
      await page.unroute("**/v1/models");
      await page.unroute("**/api/custom-providers");
    }
  }, 30000);
});
