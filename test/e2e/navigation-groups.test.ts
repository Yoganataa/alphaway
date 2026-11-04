/**
 * Responsive sidebar group interaction tests.
 * Each file runs its own isolated AlphaWay server and uses a unique test port.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("AlphaWay sidebar navigation groups", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20150);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("collapses and expands groups without persisting a server preference", async () => {
    const { page, baseURL } = dashboard;
    await page.goto(`${baseURL}/`);

    const sidebar = page.locator("aside");
    const mainGroup = sidebar.locator('[data-nav-section="Main"]');
    const advancedGroup = sidebar.locator('[data-nav-section="Advanced Features"]');
    const mainItems = mainGroup.locator("#nav-items-main");
    const endpointItem = mainItems.getByRole("button", { name: /Endpoint & Key/ });

    const collapseMain = mainGroup.getByRole("button", { name: "Collapse Main navigation group" });
    expect(await collapseMain.getAttribute("aria-expanded")).toBe("true");
    expect(await endpointItem.isVisible()).toBe(true);
    expect(await advancedGroup.locator("#nav-items-advanced-features").isVisible()).toBe(true);

    await collapseMain.click();
    const expandMain = mainGroup.getByRole("button", { name: "Expand Main navigation group" });
    expect(await expandMain.getAttribute("aria-expanded")).toBe("false");
    expect(await endpointItem.isVisible()).toBe(false);

    // Collapsing one group must not hide or mutate other groups.
    expect(await advancedGroup.locator("#nav-items-advanced-features").isVisible()).toBe(true);
    expect(await sidebar.locator('[data-nav-section="System"] #nav-items-system').isVisible()).toBe(true);

    await expandMain.click();
    expect(await endpointItem.isVisible()).toBe(true);
    expect(await mainGroup.getByRole("button", { name: "Collapse Main navigation group" }).getAttribute("aria-expanded")).toBe("true");

    // Collapse state is intentionally in-memory only until a navigation-preference
    // API exists; a fresh dashboard load starts with every group expanded.
    await mainGroup.getByRole("button", { name: "Collapse Main navigation group" }).click();
    await page.reload();
    const reloadedMain = sidebar.locator('[data-nav-section="Main"]');
    expect(await reloadedMain.getByRole("button", { name: "Collapse Main navigation group" }).getAttribute("aria-expanded")).toBe("true");
    expect(await reloadedMain.locator("#nav-items-main").getByRole("button", { name: /Endpoint & Key/ }).isVisible()).toBe(true);
  }, 20000);
});
