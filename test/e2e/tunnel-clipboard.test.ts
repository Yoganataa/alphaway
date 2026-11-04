/**
 * Tunnel endpoint clipboard feedback regression.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Tunnel endpoint clipboard feedback", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20154);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("surfaces rejected clipboard writes and confirms a successful endpoint copy", async () => {
    const { page, baseURL } = dashboard;
    const publicUrl = "https://alphaway-tunnel.example/v1";

    await page.route("**/health", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.endpoint = { publicUrl, tunnel: true };
      await route.fulfill({ response, json: payload });
    });

    await page.goto(`${baseURL}/`);
    await page.getByRole("button", { name: "Tunnel & Daemon" }).click();

    const copyButton = page.locator("#copy-public-endpoint");
    await copyButton.waitFor({ state: "visible", timeout: 10000 });
    expect(await copyButton.textContent()).toContain("Copy Endpoint");

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("clipboard denied");
          },
        },
      });
    });

    await copyButton.click();
    await page.getByText("Could not copy public endpoint: clipboard denied", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    expect(await copyButton.textContent()).toContain("Copy Endpoint");
    expect(await copyButton.textContent()).not.toContain("Copied");

    await page.evaluate(() => {
      const target = window as typeof window & { __clipboardWrites?: string[] };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            target.__clipboardWrites ??= [];
            target.__clipboardWrites.push(value);
          },
        },
      });
    });

    await copyButton.click();
    await page.getByText("Public endpoint copied to clipboard", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    await copyButton.getByText("Copied").waitFor({ state: "visible", timeout: 5000 });

    const writes = await page.evaluate(() => {
      return (window as typeof window & { __clipboardWrites?: string[] }).__clipboardWrites ?? [];
    });
    expect(writes).toEqual([publicUrl]);
    await page.unroute("**/health");
  }, 20000);
});
