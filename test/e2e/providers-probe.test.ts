/**
 * Custom provider probe UI regression tests.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Custom provider probe dashboard", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20150);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("reports upstream status and makes the single-model probe scope explicit", async () => {
    const { page, baseURL } = dashboard;
    await page.goto(`${baseURL}/`);
    await page.getByRole("button", { name: "Providers" }).click();
    await page.getByRole("button", { name: "Add Provider" }).click();

    await page.locator("#provider-id").fill("probe-regression");
    await page.locator("#provider-name").fill("Probe Regression");
    await page.locator("#provider-models").fill("probe-model-one, probe-model-two");

    await page.route("**/api/custom-providers/test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: 204,
          message: "OpenAI endpoint reachable!",
        }),
      });
    });

    const probeRequestPromise = page.waitForRequest((request) =>
      request.url().endsWith("/api/custom-providers/test") && request.method() === "POST"
    );
    await page.getByRole("button", { name: "Test Connection" }).click();
    const probeRequest = await probeRequestPromise;
    expect(probeRequest.postDataJSON()).toMatchObject({ model: "probe-model-one" });

    const probeResult = page.getByText(/Probe succeeded \(upstream HTTP 204\)/);
    await probeResult.waitFor({ state: "visible", timeout: 10000 });
    const probeMessage = await probeResult.textContent();
    expect(probeMessage).toContain("Tested one configured model (probe-model-one)");
    expect(probeMessage).toContain("the configured model list was not validated");
    expect(probeMessage).not.toContain("0ms");
    expect(probeMessage).not.toContain("models valid");

    await page.unroute("**/api/custom-providers/test");
    await page.getByRole("button", { name: "Cancel" }).click();
  }, 20000);
});
