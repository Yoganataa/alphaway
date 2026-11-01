/**
 * E2E Test Harness for AlphaWay Web Dashboard.
 * Runs a real server with an isolated SQLite state directory and an authenticated
 * administrator browser session.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium, type Browser, type Page } from "@playwright/test";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");

export interface BridgeDashboard {
  page: Page;
  browser: Browser;
  baseURL: string;
  server: ChildProcess;
  adminCookie: string;
  stop: () => Promise<void>;
}

async function waitForServer(url: string, processHandle: ChildProcess, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (processHandle.exitCode !== null) {
      throw new Error(`AlphaWay server exited prematurely with code ${processHandle.exitCode}`);
    }
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {
      // The native server has not finished starting yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`AlphaWay failed to become healthy at ${url}/health within ${timeoutMs}ms`);
}

export async function startBridgeDashboard(port = 20149): Promise<BridgeDashboard> {
  const bunPath = process.execPath;
  const serverScript = resolve(REPO_ROOT, "src", "index.ts");
  const stateDir = mkdtempSync(join(tmpdir(), "alphaway-e2e-"));

  const server = spawn(bunPath, [serverScript], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ALPHAWAY_STATE_DIR: stateDir,
      ALPHAWAY_DB_PATH: join(stateDir, "alphaway.sqlite"),
      ALPHAWAY_ENCRYPTION_KEY: "",
      API_KEY: "",
      BRIDGE_API_KEY: "",
      PORT: String(port),
      HOST: "127.0.0.1",
      ALLOW_NODE: "1",
      NODE_ENV: "test",
      UPDATE_MODE: "reactive",
    },
    stdio: ["ignore", "ignore", "ignore"],
  });

  const baseURL = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(baseURL, server);
  } catch (error) {
    server.kill("SIGKILL");
    rmSync(stateDir, { recursive: true, force: true });
    throw error;
  }

  let adminCookie: string;
  try {
    const statusResponse = await fetch(`${baseURL}/api/admin/auth/status`);
    if (!statusResponse.ok) throw new Error("Could not load administrator bootstrap status");
    const status = await statusResponse.json() as { configured: boolean };

    if (!status.configured) {
      const bootstrapToken = readFileSync(join(stateDir, "admin-bootstrap.token"), "utf8").trim();
      const bootstrapResponse = await fetch(`${baseURL}/api/admin/auth/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapToken,
          username: "alphaway-e2e-admin",
          password: "AlphaWay-E2E-Admin-Password-2026!",
        }),
      });
      if (!bootstrapResponse.ok) {
        throw new Error(`E2E administrator bootstrap failed: ${bootstrapResponse.status} ${await bootstrapResponse.text()}`);
      }
    }

    const loginResponse = await fetch(`${baseURL}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "alphaway-e2e-admin",
        password: "AlphaWay-E2E-Admin-Password-2026!",
      }),
    });
    if (!loginResponse.ok) {
      throw new Error(`E2E administrator login failed: ${loginResponse.status} ${await loginResponse.text()}`);
    }

    adminCookie = (loginResponse.headers.get("set-cookie") || "").split(";")[0];
    if (!adminCookie.startsWith("alphaway_admin_session=")) {
      throw new Error("E2E login did not issue an administrator session cookie");
    }
  } catch (error) {
    server.kill("SIGKILL");
    rmSync(stateDir, { recursive: true, force: true });
    throw error;
  }

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    server.kill("SIGKILL");
    rmSync(stateDir, { recursive: true, force: true });
    throw error;
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{
    name: "alphaway_admin_session",
    value: adminCookie.split("=").slice(1).join("="),
    url: baseURL,
    httpOnly: true,
    sameSite: "Strict",
  }]);
  const page = await context.newPage();

  return {
    page,
    browser,
    baseURL,
    server,
    adminCookie,
    stop: async () => {
      try {
        if (process.platform === "win32" && server.pid) {
          spawn("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
        } else {
          server.kill("SIGKILL");
        }
      } catch {}
      try { await browser.close(); } catch {}
      try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    },
  };
}
