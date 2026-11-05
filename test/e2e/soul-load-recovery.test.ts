/**
 * SOUL Studio must not save an empty/default editor draft when the persisted configuration is unavailable.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startBridgeDashboard, type BridgeDashboard } from "./harness";

describe("SOUL Studio configuration load recovery", () => {
  let dashboard: BridgeDashboard;

  beforeAll(async () => {
    dashboard = await startBridgeDashboard(20162);
  }, 60000);

  afterAll(async () => {
    if (dashboard) await dashboard.stop();
  }, 15000);

  it("blocks live and disk writes until the canonical SOUL configuration is loaded and fresh", async () => {
    const { page, baseURL } = dashboard;
    let reads = 0;
    let writes = 0;
    let lastWrite: Record<string, unknown> | null = null;
    let signalHeldRefresh!: () => void;
    const heldRefresh = new Promise<void>((resolve) => {
      signalHeldRefresh = resolve;
    });
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    const config = (content: string) => ({
      ok: true,
      enabled: true,
      mode: "custom",
      preset: "custom",
      source: "custom_content",
      filePath: null,
      content,
      tokenEstimate: Math.ceil(content.length / 4),
      presets: {
        atlas: "# Atlas fixture\n- Keep the Atlas preset available.",
        minimalist: "# Minimalist fixture\n- Write code, not prose.",
        socratic: "# Socratic fixture\n- Ask one precise question.",
      },
    });

    try {
      // Soul Studio is lazy-mounted from the Persona tab's SOUL.md section.
      await page.goto(baseURL + "/");

      await page.route("**/api/soul", async (route) => {
        const method = route.request().method();
        if (method === "GET") {
          reads += 1;
          if (reads === 1) {
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Simulated SOUL configuration outage" }),
            });
            return;
          }
          if (reads === 2) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                ok: true,
                enabled: true,
                mode: "auto",
                preset: "atlas",
                source: "preset",
                filePath: null,
                content: "",
                tokenEstimate: 0,
                presets: { atlas: "incomplete catalog" },
              }),
            });
            return;
          }
          if (reads === 3) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(config("Protected SOUL content")),
            });
            return;
          }
          if (reads === 4) {
            signalHeldRefresh();
            await refreshGate;
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "Simulated SOUL refresh outage" }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(config("Recovered SOUL content")),
          });
          return;
        }

        if (method === "POST") {
          writes += 1;
          lastWrite = route.request().postDataJSON() as Record<string, unknown>;
          // The real POST contract omits the presets catalog. The client must keep
          // the last validated catalog instead of replacing it with undefined.
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              enabled: lastWrite.enabled ?? true,
              mode: lastWrite.mode ?? "custom",
              preset: lastWrite.preset ?? "custom",
              source: "custom_content",
              filePath: null,
              content: lastWrite.content ?? "Saved SOUL content",
              tokenEstimate: 12,
            }),
          });
          return;
        }

        await route.continue();
      });

      await page.getByRole("button", { name: "Persona" }).click();
      await page.getByRole("button", { name: "SOUL.md" }).click();

      const loadError = page.locator("#soul-load-error");
      await loadError.waitFor({ state: "visible", timeout: 10000 });
      expect(await loadError.textContent()).toContain("Simulated SOUL configuration outage");
      expect(await page.locator("#soul-unavailable").isVisible()).toBe(true);
      expect(await page.locator("#soul-editor").count()).toBe(0);
      expect(await page.getByRole("button", { name: "Save to ./SOUL.md" }).count()).toBe(0);
      expect(await page.locator("#soul-refresh").count()).toBe(0);
      expect(writes).toBe(0);

      await page.locator("#soul-load-retry").click();
      await page.getByText("Invalid SOUL preset catalog response", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
      expect(await page.locator("#soul-unavailable").isVisible()).toBe(true);
      expect(await page.locator("#soul-editor").count()).toBe(0);
      expect(writes).toBe(0);

      await page.locator("#soul-load-retry").click();
      await page.locator("#soul-editor").waitFor({ state: "visible", timeout: 10000 });
      await loadError.waitFor({ state: "detached", timeout: 10000 });
      expect(await page.locator("#soul-editor").inputValue()).toBe("Protected SOUL content");
      expect(await page.getByRole("button", { name: "Save to ./SOUL.md" }).isEnabled()).toBe(true);
      expect(await page.getByText("SOUL source unknown", { exact: true }).count()).toBe(0);

      await page.locator("#soul-refresh").click();
      await heldRefresh;
      await page.locator("#soul-refreshing").waitFor({ state: "visible", timeout: 5000 });
      expect(await page.locator("#soul-editor").isDisabled()).toBe(true);
      expect(await page.getByRole("button", { name: "Save to ./SOUL.md" }).isDisabled()).toBe(true);
      expect(await page.getByRole("button", { name: "Apply Live (In-Memory)" }).isDisabled()).toBe(true);
      expect(writes).toBe(0);

      releaseRefresh();
      await loadError.waitFor({ state: "visible", timeout: 10000 });
      expect(await loadError.textContent()).toContain("last successful configuration");
      expect(await loadError.textContent()).toContain("Simulated SOUL refresh outage");
      expect(await page.locator("#soul-editor").inputValue()).toBe("Protected SOUL content");
      expect(await page.locator("#soul-editor").isDisabled()).toBe(true);
      expect(await page.getByRole("button", { name: "Save to ./SOUL.md" }).isDisabled()).toBe(true);
      expect(writes).toBe(0);

      await page.locator("#soul-load-retry").click();
      await page.waitForFunction(() => {
        const editor = document.querySelector<HTMLTextAreaElement>("#soul-editor");
        return editor?.value === "Recovered SOUL content";
      }, undefined, { timeout: 10000 });
      await loadError.waitFor({ state: "detached", timeout: 10000 });
      expect(await page.locator("#soul-editor").inputValue()).toBe("Recovered SOUL content");
      expect(await page.getByRole("button", { name: "Save to ./SOUL.md" }).isEnabled()).toBe(true);

      await page.locator("#soul-editor").fill("Safe recovered SOUL content");
      await page.getByRole("button", { name: "Save to ./SOUL.md" }).click();
      await page.getByText(/Saved to disk/).waitFor({ state: "visible", timeout: 10000 });

      expect(reads).toBe(5);
      expect(writes).toBe(1);
      expect(lastWrite?.saveToFile).toBe(true);
      expect(lastWrite?.targetPath).toBe("./SOUL.md");
      expect(lastWrite?.content).toBe("Safe recovered SOUL content");

      const minimalPreset = page.getByRole("button", { name: /Minimalist/ });
      await minimalPreset.click();
      expect(await page.locator("#soul-editor").inputValue()).toContain("Write code, not prose.");
    } finally {
      releaseRefresh();
      await page.unroute("**/api/soul");
    }
  }, 30000);
});
