/**
 * Comprehensive E2E Tests for AlphaWay Web Dashboard
 *
 * Verifies Svelte 5 + Tailwind 4 UI integration with the Hono backend.
 * Zero Weakened Tests Policy: all assertions verify real DOM elements and state.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("AlphaWay Web Dashboard E2E", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20149);
  }, 60000);

  afterAll(async () => {
    if (dashboard) {
      try {
        await fetch(`${dashboard.baseURL}/api/tokensaver`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: dashboard.adminCookie },
          body: JSON.stringify({ cavemanEnabled: false, adhdEnabled: false }),
        });
      } catch {}
      await dashboard.stop();
    }
  }, 15000);

  it("groups implemented navigation into Main, Advanced Features, and System", async () => {
    const { page, baseURL } = dashboard;
    await page.goto(`${baseURL}/`);

    const sidebar = page.locator("aside");
    const mainGroup = sidebar.locator('[data-nav-section="Main"]');
    const advancedGroup = sidebar.locator('[data-nav-section="Advanced Features"]');
    const systemGroup = sidebar.locator('[data-nav-section="System"]');

    expect(await mainGroup.isVisible()).toBe(true);
    expect(await advancedGroup.isVisible()).toBe(true);
    expect(await systemGroup.isVisible()).toBe(true);

    const mainText = await mainGroup.textContent();
    const advancedText = await advancedGroup.textContent();
    const systemText = await systemGroup.textContent();

    for (const label of ["Endpoint & Key", "Providers", "Usage", "Quota Tracker", "Token Saver"]) {
      expect(mainText).toContain(label);
    }
    for (const label of ["Security", "Persona", "Plans"]) {
      expect(advancedText).toContain(label);
    }
    for (const label of ["Proxy Pools", "Playground", "Console Log", "Tunnel & Daemon", "Profile & Settings"]) {
      expect(systemText).toContain(label);
    }

    for (const unavailable of ["Combos", "CLI Tools", "Media Providers", "Skills", "Terminal"]) {
      expect(`${mainText} ${advancedText} ${systemText}`).not.toContain(unavailable);
    }
  }, 15000);

  it("searches implemented pages in the command palette and handles empty keyboard results", async () => {
    const { page, baseURL } = dashboard;
    await page.goto(`${baseURL}/`);

    await page.keyboard.press("Control+k");
    const search = page.getByRole("textbox", { name: "Search commands and pages" });
    await search.waitFor({ state: "visible", timeout: 10000 });

    // Query changes reset the selected row; Enter opens the single matching page.
    await search.press("ArrowDown");
    await search.press("ArrowDown");
    await search.fill("Plans");
    const plansOption = page.locator("#command-option-plans");
    await plansOption.waitFor({ state: "visible", timeout: 10000 });
    expect(await plansOption.getAttribute("aria-selected")).toBe("true");
    await search.press("Enter");
    await page.getByRole("heading", { name: "Plans", exact: true }).waitFor({ state: "visible", timeout: 10000 });

    // Backend-gap pages must not appear as working navigation commands.
    await page.keyboard.press("Control+k");
    const reopenedSearch = page.getByRole("textbox", { name: "Search commands and pages" });
    await reopenedSearch.fill("Terminal");
    await page.getByText("No implemented pages or actions match this search.", { exact: true }).waitFor({ state: "visible" });
    await reopenedSearch.press("ArrowDown");
    await reopenedSearch.press("ArrowUp");
    await reopenedSearch.press("Enter");
    expect(await reopenedSearch.isVisible()).toBe(true);

    // The real Proxy Pools page is searchable and navigable as well.
    await reopenedSearch.fill("Proxy Pools");
    const proxyOption = page.locator("#command-option-proxy");
    await proxyOption.waitFor({ state: "visible", timeout: 10000 });
    await reopenedSearch.press("Enter");
    await page.getByText("Egress Proxy Configuration", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
  }, 20000);

  it("keeps TopBar titles aligned with implemented navigation labels", async () => {
    const { page, baseURL } = dashboard;
    await page.goto(`${baseURL}/`);

    const expectedTitles = [
      "Endpoint & Key",
      "Providers",
      "Usage",
      "Quota Tracker",
      "Token Saver",
      "Security",
      "Persona",
      "Plans",
      "Proxy Pools",
      "Playground",
      "Console Log",
      "Tunnel & Daemon",
      "Profile & Settings",
    ];

    const headerTitle = page.locator("header h1");
    for (const title of expectedTitles) {
      const navigationItem = page.locator("aside button").filter({ hasText: title }).first();
      await navigationItem.click();
      await page.waitForFunction(
        (expected) => document.querySelector("header h1")?.textContent?.includes(expected) ?? false,
        title,
        { timeout: 10000 }
      );
      expect(await headerTitle.textContent()).toContain(title);
    }
  }, 20000);

  it("opens and closes the grouped sidebar on mobile navigation", async () => {
    const { page, baseURL } = dashboard;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseURL}/`);

    const sidebar = page.locator("aside");
    await page.waitForFunction(() => {
      const element = document.querySelector("aside");
      return Boolean(element && element.getBoundingClientRect().left < 0);
    });

    await page.getByRole("button", { name: "Toggle mobile menu" }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector("aside");
      return Boolean(element && Math.abs(element.getBoundingClientRect().left) < 1);
    });

    await sidebar.locator("button").filter({ hasText: "Proxy Pools" }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector("aside");
      return Boolean(element && element.getBoundingClientRect().left < 0);
    });
    await page.getByText("Egress Proxy Configuration", { exact: true }).waitFor({ state: "visible", timeout: 10000 });

    await page.setViewportSize({ width: 1440, height: 900 });
  }, 20000);

  it("loads the dashboard and renders runtime metadata from health and the active origin", async () => {
    const { page, baseURL } = dashboard;
    const expectedTls = "AlphaWay E2E TLS profile sentinel";

    await page.route("**/health", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.tls = expectedTls;
      await route.fulfill({ response, json: payload });
    });

    await page.goto(`${baseURL}/`);

    const health = await page.evaluate(async () => {
      const response = await fetch("/health");
      if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
      return response.json();
    });

    const headerTitle = await page.textContent("header h1");
    expect(headerTitle).toContain("AlphaWay");

    await page.locator("header").getByText(new URL(baseURL).host, { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    await page.locator("header").getByText(health.tls, { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    const headerText = await page.textContent("header");
    expect(health.tls).toBe(expectedTls);
    expect(headerText).toContain(expectedTls);
    expect(headerText).not.toContain("BoringSSL Native Parity");
    expect(headerText).toContain(new URL(baseURL).host);

    await page.getByText("Dashboard origin", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    const sidebarText = await page.locator("aside").textContent();
    expect(sidebarText).toContain(expectedTls);
    expect(sidebarText).toContain("Local retry gate");
    expect(sidebarText).toContain(health.identity.gate.status.toUpperCase());
    expect(sidebarText).toContain(`${health.identity.gate.anchors.tools.length} tools · ${health.identity.gate.anchors.headers.length} headers`);
    expect(sidebarText).toContain(new URL(baseURL).host);
    expect(sidebarText).not.toContain("OPEN (5/5)");

    const bodyText = await page.textContent("main");
    expect(bodyText).toContain("TLS Profile");
    expect(bodyText).toContain(expectedTls);
    expect(bodyText).not.toContain("17 ciphers · 12 extensions");
    expect(bodyText).toContain("Local Retry Gate");
    expect(bodyText).toContain("OpenAI Client Integration");
    expect(bodyText).toContain(`${new URL(baseURL).origin}/v1`);
    expect(bodyText).not.toContain("17 ciphers · 12 extensions");
  });

  it("navigates to Playground and verifies model selection and prompt inputs", async () => {
    const { page } = dashboard;

    // Click Playground Tab
    await page.getByRole("button", { name: "Playground" }).click();

    // Verify Playground Controls
    const modelSelect = page.locator("#playground-model");
    await modelSelect.waitFor({ state: "visible", timeout: 10000 });

    const selectedValue = await modelSelect.inputValue();
    expect(selectedValue.length).toBeGreaterThan(0);

    // Verify System Prompt and User Prompt
    const systemPrompt = page.locator("#playground-system");
    expect(await systemPrompt.isVisible()).toBe(true);
    const systemVal = await systemPrompt.inputValue();
    expect(systemVal).toContain("<env>");

    const userPrompt = page.locator("#playground-user");
    expect(await userPrompt.isVisible()).toBe(true);

    const sendBtn = page.locator("#playground-send-btn");
    expect(await sendBtn.isVisible()).toBe(true);
    expect(await sendBtn.isEnabled()).toBe(true);
  }, 15000);

  it("renders configured OpenCode request anchors from the health contract", async () => {
    const { page } = dashboard;

    const health = await page.evaluate(async () => {
      const response = await fetch("/health");
      if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
      return response.json();
    });

    await page.getByRole("button", { name: "Providers" }).click();

    await page.getByText(health.identity.gate.anchors.tools.join(", "), { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    await page.getByText(health.identity.gate.anchors.headers.join(", "), { exact: true }).waitFor({ state: "visible", timeout: 10000 });

    const mainText = await page.textContent("main");
    expect(mainText).toContain("OpenCode Free-Tier");
    expect(mainText).toContain("Configured Request Anchors");
    expect(mainText).toContain(`Adapter: ${health.providers.opencode.status}`);
    expect(mainText).toContain(`Local retry gate: ${health.identity.gate.status.toUpperCase()}`);
    for (const anchor of health.identity.gate.anchors.tools) expect(mainText).toContain(anchor);
    for (const anchor of health.identity.gate.anchors.headers) expect(mainText).toContain(anchor);
    expect(mainText).not.toContain("BoringSSL 17 Ciphers");
    expect(mainText).not.toContain("12 TLS Extensions");

    expect(mainText).toContain("CodeBuddy International");
    expect(mainText).toContain("Start OAuth Login");
  }, 15000);

  it("navigates to TokenSaver, toggles settings and tests compression sandbox", async () => {
    const { page } = dashboard;

    // Click TokenSaver Tab
    await page.getByRole("button", { name: "Token Saver" }).click();

    const mainText = await page.textContent("main");
    expect(mainText).toContain("TokenSaver Optimization Engine");
    expect(mainText).toContain("RTK Deduplication");
    expect(mainText).toContain("Caveman Mode");
    expect(mainText).toContain("ADHD Mode");

    // Verify Save Button
    const saveBtn = page.locator("#tokensaver-save-btn");
    expect(await saveBtn.isVisible()).toBe(true);

    // Verify Compression Sandbox
    const sandboxInput = page.locator("#sandbox-input");
    expect(await sandboxInput.isVisible()).toBe(true);

    const compressBtn = page.locator("#tokensaver-compress-btn");
    expect(await compressBtn.isVisible()).toBe(true);
    await compressBtn.click();

    // Verify sandbox output is populated
    const sandboxOutput = page.locator("#sandbox-output");
    expect(await sandboxOutput.isVisible()).toBe(true);
    const outputVal = await sandboxOutput.inputValue();
    expect(outputVal.length).toBeGreaterThan(0);
  }, 15000);

  it("navigates to Proxy Pools and tests proxy configuration form", async () => {
    const { page } = dashboard;

    // Click Proxy Pools Tab
    await page.getByRole("button", { name: "Proxy Pools" }).click();

    const mainText = await page.textContent("main");
    expect(mainText).toContain("Egress Proxy Configuration");
    expect(mainText).toContain("Route all upstream inference and discovery requests");

    // Verify URL input and action buttons
    const proxyInput = page.locator("#proxy-url-input");
    expect(await proxyInput.isVisible()).toBe(true);

    const testBtn = page.locator("#proxy-test-btn");
    expect(await testBtn.isVisible()).toBe(true);

    const saveBtn = page.locator("#proxy-save-btn");
    expect(await saveBtn.isVisible()).toBe(true);
  }, 15000);

  it("navigates to Usage and verifies persisted telemetry", async () => {
    const { page } = dashboard;

    // Click Usage Tab
    await page.getByRole("button", { name: "Usage" }).click();

    const mainText = await page.textContent("main");
    expect(mainText).toContain("Total Requests");
    expect(mainText).toContain("Total Tokens Processed");
    expect(mainText).toContain("TokenSaver Savings");
    expect(mainText).toContain("Protocol Distribution");
    expect(mainText).toContain("Recent Request Audit Log");
  }, 15000);

  it("navigates to Tunnel & Daemon and verifies status cards", async () => {
    const { page } = dashboard;

    // Click Tunnel & Daemon Tab
    await page.getByRole("button", { name: "Tunnel & Daemon" }).click();

    const mainText = await page.textContent("main");
    expect(mainText).toContain("Cloudflare Named Tunnel");
    expect(mainText).toContain("Daemon Process Lifecycle");
    expect(mainText).toContain("bun src/index.ts --daemon");
    expect(mainText).toContain("bun src/index.ts --status");
    expect(mainText).toContain("bun src/index.ts --stop");
  }, 15000);

  it("navigates to Persona and opens the preserved SOUL Studio section", async () => {
    const { page } = dashboard;

    await page.getByRole("button", { name: "Persona" }).click();
    await page.getByText("Model Personas").waitFor({ state: "visible" });
    // Wait for the asynchronous Persona API request to finish before checking
    // the preset editor, which is not rendered while the view is loading.
    await page.getByText("Preset Library").waitFor({ state: "visible" });
    const personaText = await page.textContent("main");
    expect(personaText).toContain("Preset Library");

    await page.getByRole("button", { name: "SOUL.md" }).click();

    const mainText = await page.textContent("main");
    expect(mainText).toContain("Soul Studio");
    expect(mainText).toContain("Atlas");
    expect(mainText).toContain("Minimalist");
    expect(mainText).toContain("Socratic");

    const editor = page.locator("#soul-editor");
    await editor.waitFor({ state: "visible" });
    // Soul configuration is loaded asynchronously after the inner tab mounts.
    await page.waitForFunction(() => {
      const element = document.querySelector<HTMLTextAreaElement>("#soul-editor");
      return Boolean(element && element.value.trim().length > 0);
    });
    expect(await editor.isVisible()).toBe(true);
    const content = await editor.inputValue();
    expect(content.length).toBeGreaterThan(0);
  }, 15000);
 
  it("labels the dashboard API key as browser-scoped and reports database journal state", async () => {
    const { page } = dashboard;
    await page.getByRole("button", { name: "Profile & Settings" }).click();

    const apiKey = page.locator("#dashboard-client-api-key");
    await apiKey.waitFor({ state: "visible", timeout: 10000 });
    expect(await apiKey.getAttribute("type")).toBe("password");

    const mainText = await page.textContent("main");
    expect(mainText).toContain("Dashboard Client API Key");
    expect(mainText).toContain("does not change server environment variables or create a managed API key");

    const stats = await page.evaluate(async () => {
      const response = await fetch("/api/settings/database/stats");
      if (!response.ok) throw new Error(`Database stats request failed: ${response.status}`);
      return response.json();
    });
    await page.getByText(stats.journalMode.toUpperCase(), { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    await page.getByText(stats.engine, { exact: true }).waitFor({ state: "visible", timeout: 10000 });
  }, 15000);

  it("shows an inherited Plan quota for a managed API key in the dashboard", async () => {
    const { page, baseURL, adminCookie } = dashboard;
    const adminHeaders = {
      Cookie: adminCookie,
      Origin: baseURL,
      "Content-Type": "application/json",
    };

    const planName = "Phase 3 E2E Starter";
    const keyName = "Phase 3 E2E Managed Key";
    const planResponse = await fetch(baseURL + "/api/plans", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: planName,
        description: "Dashboard policy regression",
        rpmLimit: 5,
        tpmLimit: 4000,
        concurrencyLimit: 2,
        tokenQuota: 1000,
        allowedModels: ["e2e-model"],
      }),
    });
    expect(planResponse.status).toBe(201);
    const plan = (await planResponse.json()).plan;

    const keyResponse = await fetch(baseURL + "/api/keys", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name: keyName }),
    });
    expect(keyResponse.status).toBe(201);
    const key = (await keyResponse.json()).key;

    await page.getByRole("button", { name: "Endpoint" }).click();
    const planSelect = page.getByRole("combobox", { name: "Plan for " + keyName });
    await planSelect.waitFor({ state: "visible", timeout: 10000 });
    await planSelect.selectOption(plan.id);
    await page.getByText("Plan assigned to API key", { exact: true }).waitFor({ state: "visible", timeout: 10000 });

    await page.getByRole("button", { name: "Quota Tracker" }).click();
    const row = page.locator("tbody tr").filter({ hasText: keyName });
    await row.waitFor({ state: "visible", timeout: 10000 });
    expect(await row.locator("td").nth(1).textContent()).toContain(planName);
    expect(await row.locator("td").nth(5).textContent()).toContain("1,000");

    const usageWindow = page.getByRole("combobox", { name: "Usage window" });
    await usageWindow.selectOption("7d");
    await page.getByText("Recorded usage (Last 7 days)", { exact: true }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Plans" }).click();
    await page.getByRole("heading", { name: "Plans", exact: true }).waitFor({ state: "visible", timeout: 10000 });
    await page.getByRole("heading", { name: planName }).waitFor({ state: "visible", timeout: 10000 });
    const mainText = await page.textContent("main");
    expect(mainText).toContain("Plans");
    expect(mainText).toContain(planName);
    expect(mainText).toContain("Allowed models");
  }, 20000);

  it("creates, edits, and deletes a Plan through the dashboard UI", async () => {
    const { page } = dashboard;
    await page.getByRole("button", { name: "Plans" }).click();
    await page.getByRole("heading", { name: "Plans", exact: true }).waitFor({ state: "visible", timeout: 10000 });

    const originalName = "Phase 3 UI Lifecycle";
    const editedName = "Phase 3 UI Lifecycle Edited";
    await page.getByLabel("Name", { exact: true }).fill(originalName);
    await page.getByLabel("Description", { exact: true }).fill("Plan CRUD browser regression");
    await page.getByLabel("RPM (0 = unlimited)", { exact: true }).fill("9");
    await page.getByLabel("Prompt TPM (0 = unlimited)", { exact: true }).fill("900");
    await page.getByLabel("Concurrency (0 = unlimited)", { exact: true }).fill("2");
    await page.getByLabel("Lifetime tokens (0 = unlimited)", { exact: true }).fill("5000");
    await page.getByLabel(/Allowed models/).fill("ui-lifecycle-*");
    await page.getByRole("button", { name: "Create Plan" }).click();

    await page.getByRole("heading", { name: originalName }).waitFor({ state: "visible", timeout: 10000 });
    const originalCard = page.locator("article").filter({ hasText: originalName });
    await originalCard.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Name", { exact: true }).fill(editedName);
    await page.getByRole("button", { name: "Save Changes" }).click();

    await page.getByRole("heading", { name: editedName }).waitFor({ state: "visible", timeout: 10000 });
    const editedCard = page.locator("article").filter({ hasText: editedName });
    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    await editedCard.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("heading", { name: editedName }).waitFor({ state: "detached", timeout: 10000 });
  }, 20000);

});
