/**
 * Integration Test for Hono Application Engine
 */

import { describe, it, expect } from "bun:test";
import { app } from "../src/app";
import { adminRequest, adminHeaders } from "./helpers/admin";
import { issueAPIKey } from "../src/core/api-keys";

describe("Hono application engine", () => {
  it("answers /health with diagnostics and provider status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.framework).toBe("Hono.js");
    expect(json.tls).toBe("BoringSSL Native Parity");
    expect(json.providers.codebuddy).toBeDefined();
    expect(json.providers.opencode).toBeDefined();
  });

  it("lists both OpenCode and CodeBuddy models on /v1/models with a managed key", async () => {
    await adminHeaders();
    const apiKey = issueAPIKey("Hono integration test");
    const res = await app.request("/v1/models", {
      headers: { Authorization: `Bearer ${apiKey.secret}` },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.object).toBe("list");
    const opencodeModels = json.data.filter(
      (model: any) => model.owned_by === "opencode-free" || model.provider === "opencode"
    );
    const codebuddyModels = json.data.filter((model: any) => model.owned_by === "codebuddy");

    // OpenCode's live model catalogue is dynamic; assert provider presence
    // instead of pinning an upstream model ID that may be retired.
    expect(opencodeModels.length).toBeGreaterThan(0);
    expect(codebuddyModels.map((model: any) => model.id)).toContain("deepseek-v4.1-flash");
    expect(codebuddyModels.map((model: any) => model.id)).toContain("glm-5.2");
  });

  it("returns tokensaver config on /api/tokensaver", async () => {
    const res = await adminRequest("/api/tokensaver");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.rtkEnabled).toBe("boolean");
    expect(typeof json.rtkMaxLines).toBe("number");
  });

  it("serves the Svelte dashboard on /", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!doctype html>");
  });
});
