import { beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { adminHeaders, adminRequest } from "./helpers/admin";
import { issueAPIKey } from "../src/core/api-keys";
import { getDatabase } from "../src/core/database";
import { __getLoginKdfStateForTests, loginAdmin } from "../src/core/admin-auth";
import { randomUUID } from "node:crypto";

describe("administrator authentication and managed gateway API keys", () => {
  beforeEach(() => {
    const db = getDatabase();
    db.prepare("DELETE FROM api_keys").run();
    db.prepare("DELETE FROM custom_providers").run();
  });

  it("denies admin APIs without a valid administrator session", async () => {
    const response = await app.request("/api/keys", { headers: { Host: "localhost" } });
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("admin_auth_required");
  });

  it("rejects a same-host but cross-port Origin for cookie-authenticated admin requests", async () => {
    const session = await adminHeaders();
    const response = await app.request("/api/keys", {
      headers: {
        ...session,
        Host: "localhost:20129",
        Origin: "http://localhost:3000",
        "sec-fetch-site": "same-site",
      },
    });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("admin_origin_rejected");
  });

  it("accepts an exact same-origin request including the port", async () => {
    const session = await adminHeaders();
    const response = await app.request("/api/keys", {
      headers: {
        ...session,
        Host: "localhost:20129",
        Origin: "http://localhost:20129",
      },
    });
    expect(response.status).toBe(200);
  });

  it("keeps administrator status public but protects dashboard session endpoints and sets secure cookie attributes", async () => {
    await adminHeaders();
    const status = await app.request("/api/admin/auth/status", { headers: { Host: "localhost" } });
    expect(status.status).toBe(200);
    expect((await status.json()).configured).toBe(true);

    const anonymous = await app.request("/api/admin/auth/session", { headers: { Host: "localhost" } });
    expect(anonymous.status).toBe(200);
    expect((await anonymous.json()).authenticated).toBe(false);

    const login = await app.request("/api/admin/auth/login", {
      method: "POST",
      headers: { Host: "localhost", "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "alphaway-test-admin",
        password: "AlphaWay-Test-Admin-Password-2026!",
      }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie") || "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("alphaway_admin_session=");
    expect(cookie).not.toContain("Path=;");

    const bootstrapTokenResponse = await app.request("/api/admin/auth/status", { headers: { Host: "localhost" } });
    expect(JSON.stringify(await bootstrapTokenResponse.json())).not.toContain("bootstrapToken");
  });

  it("bounds login input and throttles repeated invalid credentials", async () => {
    expect(await loginAdmin("x".repeat(33), "wrong-password")).toEqual({ error: "invalid" });
    expect(await loginAdmin("alphaway-throttle-check", "x".repeat(1025))).toEqual({ error: "invalid" });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(await loginAdmin("alphaway-throttle-check", "wrong-password")).toEqual({ error: "invalid" });
    }
    expect(await loginAdmin("alphaway-throttle-check", "wrong-password")).toEqual({ error: "rate_limited" });
    expect(await loginAdmin("alphaway-throttle-check", "another-wrong-password")).toEqual({ error: "rate_limited" });
  });

  it("bounds global password KDF concurrency and queue size", async () => {
    const usernames = Array.from({ length: 24 }, () => `aw-p-${randomUUID().slice(0,12)}`);
    const attempts = usernames.map((username) => loginAdmin(username, "wrong-password"));
    // loginAdmin awaits the slot-acquisition promise before starting KDF work.
    await Promise.resolve();

    const queued = __getLoginKdfStateForTests();
    expect(queued.active).toBe(queued.maxConcurrent);
    expect(queued.queued).toBe(queued.maxQueued);
    expect(queued.active).toBeLessThanOrEqual(queued.maxConcurrent);
    expect(queued.queued).toBeLessThanOrEqual(queued.maxQueued);

    const results = await Promise.all(attempts);
    expect(results.filter((result) => result.error === "invalid")).toHaveLength(20);
    expect(results.filter((result) => result.error === "rate_limited")).toHaveLength(4);
    expect(__getLoginKdfStateForTests()).toMatchObject({ active: 0, queued: 0 });
  });

  it("serializes concurrent password checks for the same username", async () => {
    const username = `aw-s-${randomUUID().slice(0,12)}`;
    const attempts = Array.from({ length: 8 }, () => loginAdmin(username, "wrong-password"));
    await Promise.resolve();

    const queued = __getLoginKdfStateForTests();
    expect(queued.active).toBe(queued.maxConcurrent);
    expect(queued.queued).toBe(4);

    const results = await Promise.all(attempts);
    expect(results.filter((result) => result.error === "invalid")).toHaveLength(1);
    expect(results.filter((result) => result.error === "rate_limited")).toHaveLength(7);
    expect(__getLoginKdfStateForTests()).toMatchObject({ active: 0, queued: 0 });
  });

  it("requires a gateway credential on every inference alias", async () => {
    for (const pathname of ["/v1/models", "/chat/completions", "/api/chat"]) {
      const response = await app.request(pathname, { method: pathname === "/v1/models" ? "GET" : "POST" });
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("invalid_api_key");
    }

    const missing = await app.request("/v1/models");
    expect(missing.status).toBe(401);

    const malformed = await app.request("/v1/models", {
      headers: { Authorization: "Bearer not-a-valid-key" },
    });
    expect(malformed.status).toBe(401);
  });

  it("rejects missing, malformed, and invalid managed API credentials without leaking details", async () => {
    const missing = await app.request("/v1/models");
    expect(missing.status).toBe(401);

    for (const candidate of ["bad", "sk-aw-does-not-exist", "Bearer"]) {
      const response = await app.request("/v1/models", {
        headers: { Authorization: candidate.startsWith("Bearer ") ? candidate : `Bearer ${candidate}` },
      });
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("invalid_api_key");
    }
  });
  it("rejects control characters in API key labels before logging them", async () => {
    await adminHeaders();
    const created = await adminRequest("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Client\nForged log entry" }),
    });
    expect(created.status).toBe(400);

    const issued = issueAPIKey("Valid Label");
    const renamed = await adminRequest(`/api/keys/${issued.record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Changed\rLabel" }),
    });
    expect(renamed.status).toBe(400);
  });

  it("issues a random key once, lists metadata only, and authorizes inference", async () => {
    await adminHeaders();
    const created = await adminRequest("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Client" }),
    });
    expect(created.status).toBe(201);
    const result = await created.json();
    expect(result.key.secret).toMatch(/^sk-aw-[A-Za-z0-9_-]{40,}$/);
    expect(result.key.prefix).toBe(result.key.secret.slice(0, 16));

    const list = await adminRequest("/api/keys");
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.keys).toHaveLength(1);
    expect(listed.keys[0].name).toBe("Test Client");
    expect(listed.keys[0].secret).toBeUndefined();

    const stored = getDatabase().prepare("SELECT secret_hash, secret_salt FROM api_keys WHERE id = ?")
      .get(result.key.id) as { secret_hash: string; secret_salt: string };
    expect(stored.secret_hash).not.toContain(result.key.secret);
    expect(stored.secret_hash).not.toBe(result.key.secret);

    const inference = await app.request("/v1/models", {
      headers: { Authorization: `Bearer ${result.key.secret}` },
    });
    expect(inference.status).toBe(200);

    const usage = await adminRequest("/api/keys");
    expect((await usage.json()).keys[0].requestsCount).toBe(1);
  });

  it("renames, rotates and revokes a key while invalidating prior credentials", async () => {
    await adminHeaders();
    const issued = issueAPIKey("Lifecycle Test");

    const renamed = await adminRequest(`/api/keys/${issued.record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Key" }),
    });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).key.name).toBe("Renamed Key");

    const rotated = await adminRequest(`/api/keys/${issued.record.id}/rotate`, { method: "POST" });
    expect(rotated.status).toBe(200);
    const rotatedKey = (await rotated.json()).key;
    expect(rotatedKey.secret).not.toBe(issued.secret);

    const oldCredential = await app.request("/v1/models", {
      headers: { Authorization: `Bearer ${issued.secret}` },
    });
    expect(oldCredential.status).toBe(401);

    const newCredential = await app.request("/v1/models", {
      headers: { "x-api-key": rotatedKey.secret },
    });
    expect(newCredential.status).toBe(200);

    const revoked = await adminRequest(`/api/keys/${issued.record.id}`, { method: "DELETE" });
    expect(revoked.status).toBe(200);

    const revokedCredential = await app.request("/v1/models", {
      headers: { "api-key": rotatedKey.secret },
    });
    expect(revokedCredential.status).toBe(401);
  });

  it("rejects managed credentials without the inference scope", async () => {
    await adminHeaders();
    const issued = issueAPIKey("No Inference Scope");
    getDatabase().prepare("UPDATE api_keys SET scopes = ? WHERE id = ?")
      .run(JSON.stringify(["admin"]), issued.record.id);

    const response = await app.request("/v1/models", {
      headers: { Authorization: `Bearer ${issued.secret}` },
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("insufficient_scope");
  });

  it("does not expose custom provider credentials through the admin API", async () => {
    await adminHeaders();
    const { addOrUpdateCustomProvider } = await import("../src/core/custom-providers");
    addOrUpdateCustomProvider({
      id: "auth-test-provider",
      name: "Auth Test Provider",
      baseUrl: "https://provider.example/v1",
      apiKey: "sk-provider-secret-should-not-leak",
      protocol: "openai",
      models: ["auth-test-model"],
      enabled: true,
    });
    const persisted = getDatabase().prepare("SELECT api_key FROM custom_providers WHERE id = ?")
      .get("auth-test-provider") as { api_key: string };
    expect(persisted.api_key).toMatch(/^awenc:v1:/);
    expect(persisted.api_key).not.toContain("sk-provider-secret-should-not-leak");

    const response = await adminRequest("/api/custom-providers");
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(JSON.stringify(json)).not.toContain("sk-provider-secret-should-not-leak");
    expect(json.providers.find((provider: any) => provider.id === "auth-test-provider").hasApiKey).toBe(true);
    const { deleteCustomProvider } = await import("../src/core/custom-providers");
    deleteCustomProvider("auth-test-provider");
  });
});
