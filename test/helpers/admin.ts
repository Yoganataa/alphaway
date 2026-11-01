import fs from "node:fs";
import { app } from "../../src/app";
import { getAdminBootstrapTokenPath } from "../../src/core/admin-auth";

// The Bun test runner preloads isolated state before application modules are imported.

const TEST_USERNAME = "alphaway-test-admin";
const TEST_PASSWORD = "AlphaWay-Test-Admin-Password-2026!";
let cachedCookie: string | null = null;
let inFlight: Promise<string> | null = null;

/** Creates the first test administrator when needed and returns its session cookie. */
export async function getAdminCookie(): Promise<string> {
  if (cachedCookie) return cachedCookie;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const headers = { Host: "localhost" };
    const statusResponse = await app.request("/api/admin/auth/status", { headers });
    if (!statusResponse.ok) throw new Error("Could not read administrator auth status");
    const status = await statusResponse.json() as { configured: boolean };

    if (!status.configured) {
      const token = fs.readFileSync(getAdminBootstrapTokenPath(), "utf8").trim();
      const bootstrapResponse = await app.request("/api/admin/auth/bootstrap", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapToken: token, username: TEST_USERNAME, password: TEST_PASSWORD }),
      });
      if (!bootstrapResponse.ok) {
        throw new Error(`Could not bootstrap test administrator: ${bootstrapResponse.status} ${await bootstrapResponse.text()}`);
      }
    }

    const loginResponse = await app.request("/api/admin/auth/login", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
    });
    if (!loginResponse.ok) {
      throw new Error(`Could not sign in test administrator: ${loginResponse.status} ${await loginResponse.text()}`);
    }

    const setCookie = loginResponse.headers.get("set-cookie") || "";
    const cookie = setCookie.split(";")[0];
    if (!cookie.startsWith("alphaway_admin_session=")) {
      throw new Error("Administrator login did not issue the expected session cookie");
    }
    cachedCookie = cookie;
    return cookie;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export async function adminHeaders(): Promise<Record<string, string>> {
  return { Host: "localhost", Cookie: await getAdminCookie() };
}

export async function adminRequest(pathname: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(await adminHeaders()), ...(init.headers as Record<string, string> || {}) };
  return app.request(pathname, { ...init, headers });
}
