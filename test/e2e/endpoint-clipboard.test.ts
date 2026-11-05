/**
 * Clipboard feedback must reflect the actual browser clipboard operation.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("Endpoint clipboard feedback", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20153);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("reports clipboard rejections and only shows copied feedback after a successful write", async () => {
    const { page, baseURL } = dashboard;
    await page.goto(`${baseURL}/`);

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

    await page.getByTestId("copy-base-url").click();
    await page.getByText("Could not copy OpenAI Base URL: clipboard denied", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    expect(await page.getByText("OpenAI Base URL copied to clipboard", { exact: true }).count()).toBe(0);

    await page.locator("#copy-local-endpoint").click();
    await page.getByText("Could not copy to clipboard: clipboard denied", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    expect(await page.getByText("Copied to clipboard", { exact: true }).count()).toBe(0);

    await page.locator("#copy-client-snippet").click();
    const clipboardErrors = page.getByText("Could not copy to clipboard: clipboard denied", { exact: true });
    await clipboardErrors.last().waitFor({ state: "visible", timeout: 5000 });
    expect(await clipboardErrors.count()).toBe(2);
    expect(await page.locator("#copy-client-snippet").textContent()).not.toContain("Copied");

    await page.evaluate(() => {
      const target = window as typeof window & {
        __clipboardWrites?: string[];
        __resolveClipboardWrite?: () => void;
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            target.__clipboardWrites ??= [];
            target.__clipboardWrites.push(value);
            return new Promise<void>((resolve) => {
              target.__resolveClipboardWrite = resolve;
            });
          },
        },
      });
    });

    const baseUrlCopy = page.getByTestId("copy-base-url");
    await baseUrlCopy.click();
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="copy-base-url"]');
      return button?.getAttribute("aria-busy") === "true" && (button as HTMLButtonElement).disabled;
    }, { timeout: 5000 });
    expect(await baseUrlCopy.isDisabled()).toBe(true);
    expect(await baseUrlCopy.getAttribute("aria-busy")).toBe("true");
    expect(await page.getByText("OpenAI Base URL copied to clipboard", { exact: true }).count()).toBe(0);

    await page.evaluate(() => {
      const target = window as typeof window & { __resolveClipboardWrite?: () => void };
      target.__resolveClipboardWrite?.();
      delete target.__resolveClipboardWrite;
    });

    await page.getByText("OpenAI Base URL copied to clipboard", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    expect(await baseUrlCopy.isDisabled()).toBe(false);
    expect(await baseUrlCopy.getAttribute("aria-busy")).not.toBe("true");
    await page.locator("#copy-local-endpoint").click();
    await page.getByText("Copied to clipboard", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#copy-client-snippet").click();
    await page.locator("#copy-client-snippet").getByText("Copied").waitFor({ state: "visible", timeout: 5000 });

    const writes = await page.evaluate(() => {
      return (window as typeof window & { __clipboardWrites?: string[] }).__clipboardWrites ?? [];
    });
    expect(writes).toHaveLength(3);
    expect(writes[0]).toBe(`${new URL(baseURL).origin}/v1`);
    expect(writes[1]).toBe(`${new URL(baseURL).origin}/v1`);
    expect(writes[2]).toContain("mimo-v2.6-flash-free");
  }, 20000);
});
