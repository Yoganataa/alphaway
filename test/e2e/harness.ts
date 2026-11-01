/**
 * E2E Test Harness for AlphaWay Web Dashboard
 *
 * Spawns the native AlphaWay TypeScript server (bun src/index.ts) on an isolated port,
 * waits for the /health endpoint to become ready, and controls a real Playwright Chromium/Edge browser.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");

export interface BridgeDashboard {
  page: Page;
  browser: Browser;
  baseURL: string;
  server: ChildProcess;
  stop: () => Promise<void>;
}

/**
 * Wait for AlphaWay /health to respond with 200 OK
 */
async function waitForServer(url: string, processHandle: ChildProcess, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (processHandle.exitCode !== null) {
      throw new Error(`AlphaWay server exited prematurely with code ${processHandle.exitCode}`);
    }
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // server still starting up
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`AlphaWay failed to become healthy at ${url}/health within ${timeoutMs}ms`);
}

/**
 * Boots the AlphaWay server on an isolated port and connects Playwright browser.
 */
export async function startBridgeDashboard(port = 20149): Promise<BridgeDashboard> {
  const bunPath = process.execPath;
  const serverScript = resolve(REPO_ROOT, "src", "index.ts");

  const server = spawn(bunPath, [serverScript], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      ALLOW_NODE: "1",
      NODE_ENV: "test",
      UPDATE_MODE: "reactive",
    },
    stdio: "pipe",
  });

  const baseURL = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(baseURL, server);
  } catch (err) {
    server.kill();
    throw err;
  }

  let browser: Browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  return {
    page,
    browser,
    baseURL,
    server,
    stop: async () => {
      try {
        if (process.platform === "win32" && server.pid) {
          spawn("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
        } else {
          server.kill("SIGKILL");
        }
      } catch {}
      try {
        await browser.close();
      } catch {}
    },
  };
}
