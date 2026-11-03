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

  it("loads the dashboard and verifies BoringSSL Native Parity badges and overview", async () => {
    const { page, baseURL } = dashboard;
    await page.goto(`${baseURL}/`);

    // Verify Title & Header Brand
    const headerTitle = await page.textContent("header h1");
    expect(headerTitle).toContain("AlphaWay");

    // Verify BoringSSL Native Parity badge
    const badgeText = await page.textContent("header");
    expect(badgeText).toContain("BoringSSL Native Parity");
    expect(badgeText).toContain(":20129");

    // Verify Overview cards
    const bodyText = await page.textContent("main");
    expect(bodyText).toContain("TLS Fingerprint");
    expect(bodyText).toContain("17 ciphers · 12 extensions");
    expect(bodyText).toContain("OpenAI Client Integration");
    expect(bodyText).toContain("http://127.0.0.1:20129/v1");
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

  it("navigates to Providers & Models and checks OpenCode and CodeBuddy cards", async () => {
    const { page } = dashboard;

    // Click Providers & Models Tab
    await page.getByRole("button", { name: "Providers & Models" }).click();

    // Check OpenCode Free-Tier section
    const mainText = await page.textContent("main");
    expect(mainText).toContain("OpenCode Free-Tier");
    expect(mainText).toContain("Gate Shape & Fingerprint Anchors");
    expect(mainText).toContain("BoringSSL 17 Ciphers");
    expect(mainText).toContain("12 TLS Extensions");
    expect(mainText).toContain("`read` Tool Anchor");

    // Check CodeBuddy International section
    expect(mainText).toContain("CodeBuddy International");
    expect(mainText).toContain("WorkBuddy 5.8.4");
    expect(mainText).toContain("Start OAuth Login");
  }, 15000);

  it("navigates to TokenSaver, toggles settings and tests compression sandbox", async () => {
    const { page } = dashboard;

    // Click TokenSaver Tab
    await page.getByRole("button", { name: "TokenSaver" }).click();

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

  it("navigates to Egress Proxy and tests proxy configuration form", async () => {
    const { page } = dashboard;

    // Click Egress Proxy Tab
    await page.getByRole("button", { name: "Egress Proxy" }).click();

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

  it("navigates to Usage & Analytics and verifies real-time telemetry", async () => {
    const { page } = dashboard;

    // Click Usage & Analytics Tab
    await page.getByRole("button", { name: "Usage & Analytics" }).click();

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
    await expect(page.getByText("Preset Library")).toBeVisible();

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
