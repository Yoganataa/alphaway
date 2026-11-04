/**
 * Request Details clipboard feedback regressions.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Request Details clipboard feedback", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20157);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("restores Copy Request ID and reports rejected, pending, and successful ID/JSON writes", async () => {
    const { page, baseURL } = dashboard;
    const request = {
      id: "req-clipboard-regression",
      timestamp: "2026-11-04T12:00:00.000Z",
      protocol: "openai",
      model: "alpha-test-model",
      provider: "opencode",
      status: 200,
      latencyMs: 35,
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
      savedTokens: 0,
      stream: false,
    };

    await page.route("**/api/usage", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totalRequests: 1,
          successfulRequests: 1,
          failedRequests: 0,
          totalPromptTokens: 11,
          totalCompletionTokens: 7,
          totalTokens: 18,
          savedTokens: 0,
          estimatedSavingsUsd: 0,
          byModel: {},
          byProtocol: {
            openai: { requests: 1, tokens: 18, promptTokens: 11, completionTokens: 7 },
            anthropic: { requests: 0, tokens: 0 },
            responses: { requests: 0, tokens: 0 },
          },
          byProvider: {
            opencode: { requests: 1, tokens: 18, promptTokens: 11, completionTokens: 7 },
            codebuddy: { requests: 0, tokens: 0 },
            custom: { requests: 0, tokens: 0 },
          },
          recentLogs: [request],
        }),
      });
    });

    await page.goto(baseURL + "/");
    await page.getByRole("button", { name: "Usage", exact: true }).click();
    await page.getByRole("button", { name: "Request Details", exact: true }).click();
    await page.getByRole("button", { name: "View", exact: true }).click();

    const copyIdButton = page.locator("#usage-copy-request-id");
    const copyJsonButton = page.locator("#usage-copy-request-json");
    await page.getByText(request.id, { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    await copyIdButton.waitFor({ state: "visible", timeout: 5000 });
    await copyJsonButton.waitFor({ state: "visible", timeout: 5000 });

    // A rejected clipboard write must not show a false copied state.
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

    await copyIdButton.click();
    await page.getByText("Could not copy request ID: clipboard denied", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    expect(await copyIdButton.textContent()).toContain("Copy ID");
    expect(await copyIdButton.textContent()).not.toContain("Copied");

    await copyJsonButton.click();
    await page.getByText("Could not copy request audit JSON: clipboard denied", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    expect(await copyJsonButton.textContent()).toContain("Copy JSON");
    expect(await copyJsonButton.textContent()).not.toContain("Copied");

    // Pending writes remain disabled and are not reported as successful.
    await page.evaluate(() => {
      const target = window as typeof window & {
        __clipboardWrites?: string[];
        __releaseClipboardWrite?: () => void;
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            target.__clipboardWrites ??= [];
            target.__clipboardWrites.push(value);
            await new Promise<void>((resolve) => {
              target.__releaseClipboardWrite = resolve;
            });
          },
        },
      });
    });

    await copyIdButton.click();
    await copyIdButton.getByText("Copying...", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    expect(await copyIdButton.isDisabled()).toBe(true);
    expect(await page.getByText("Request ID copied to clipboard", { exact: true }).count()).toBe(0);
    await page.evaluate(() => {
      (window as typeof window & { __releaseClipboardWrite?: () => void }).__releaseClipboardWrite?.();
    });
    await copyIdButton.getByText("Copied!", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    await page.getByText("Request ID copied to clipboard", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });

    // The JSON action also confirms success only after its write resolves.
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
    await copyJsonButton.click();
    await copyJsonButton.getByText("Copied!", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    await page.getByText("Request audit JSON copied to clipboard", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });

    const writes = await page.evaluate(() => {
      return (window as typeof window & { __clipboardWrites?: string[] }).__clipboardWrites ?? [];
    });
    expect(writes).toEqual([request.id, JSON.stringify(request, null, 2)]);
  }, 25000);
});
