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

    await page.getByTestId("copy-local-endpoint").click();
    await page.getByText("Could not copy to clipboard: clipboard denied", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    expect(await page.getByText("Copied to clipboard", { exact: true }).count()).toBe(0);

    await page.getByTestId("copy-client-snippet").click();
    await page.getByText("Could not copy to clipboard: clipboard denied", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    expect(await page.getByTestId("copy-client-snippet").textContent()).not.toContain("Copied");

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

    await page.getByTestId("copy-base-url").click();
    await page.getByText("OpenAI Base URL copied to clipboard", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    await page.getByTestId("copy-local-endpoint").click();
    await page.getByText("Copied to clipboard", { exact: true })
      .waitFor({ state: "visible", timeout: 5000 });
    await page.getByTestId("copy-client-snippet").click();
    await page.getByTestId("copy-client-snippet").getByText("Copied").waitFor({ state: "visible", timeout: 5000 });

    const writes = await page.evaluate(() => {
      return (window as typeof window & { __clipboardWrites?: string[] }).__clipboardWrites ?? [];
    });
    expect(writes).toHaveLength(3);
    expect(writes[0]).toBe(`${new URL(baseURL).origin}/v1`);
    expect(writes[1]).toBe(`${new URL(baseURL).origin}/v1`);
    expect(writes[2]).toContain("mimo-v2.6-flash-free");
  }, 20000);
});
