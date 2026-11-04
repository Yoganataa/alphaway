/**
 * Playground response clipboard feedback regressions.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Playground response clipboard feedback", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20155);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("does not report copied until the clipboard write resolves and reports rejected writes", async () => {
    const { page, baseURL } = dashboard;
    const responseText = "AlphaWay Playground clipboard regression response";

    await page.route("**/v1/chat/completions", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body:
          `data: ${JSON.stringify({ choices: [{ delta: { content: responseText } }] })}\n\n` +
          "data: [DONE]\n\n",
      });
    });

    await page.goto(`${baseURL}/`);
    await page.getByRole("button", { name: "Playground" }).click();
    await page.locator("#playground-send-btn").click();
    await page.getByText(responseText, { exact: true }).waitFor({ state: "visible", timeout: 10000 });

    const copyButton = page.locator("#playground-copy-response");
    await copyButton.waitFor({ state: "visible", timeout: 5000 });

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
    await page.getByText("Could not copy Playground response: clipboard denied", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    expect(await copyButton.textContent()).toContain("Copy");
    expect(await copyButton.textContent()).not.toContain("Copied");
    expect(await page.getByText("Playground response copied to clipboard", { exact: true }).count()).toBe(0);

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

    await copyButton.click();
    await copyButton.getByText("Copying...", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    expect(await copyButton.getByText("Copied", { exact: true }).count()).toBe(0);
    expect(await page.getByText("Playground response copied to clipboard", { exact: true }).count()).toBe(0);

    await page.evaluate(() => {
      (window as typeof window & { __releaseClipboardWrite?: () => void }).__releaseClipboardWrite?.();
    });
    await copyButton.getByText("Copied", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    await page.getByText("Playground response copied to clipboard", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });

    const writes = await page.evaluate(() => {
      return (window as typeof window & { __clipboardWrites?: string[] }).__clipboardWrites ?? [];
    });
    expect(writes).toEqual([responseText]);
    await page.unroute("**/v1/chat/completions");
  }, 20000);
});
