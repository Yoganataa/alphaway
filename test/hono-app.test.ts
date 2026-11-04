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
    expect(json.providers.opencode.status).toBe("registered");
    expect(["configured", "not-configured"]).toContain(json.providers.codebuddy.status);
    expect(json.codebuddy.configured).toBe(json.providers.codebuddy.status === "configured");
    expect(json.providers.opencode).toBeDefined();
    expect(typeof json.uptimeSeconds).toBe("number");
    expect(json.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(typeof json.endpoint.publicUrl).toBe("string");
    expect(typeof json.endpoint.tunnel).toBe("boolean");
    expect(["direct", "proxy", "relay", "pool"]).toContain(json.egress.mode);
    expect(["open", "throttled", "ip-blocked"]).toContain(json.identity.gate.status);
    expect(json).not.toHaveProperty("tunnel");
    expect(json).not.toHaveProperty("daemon");
    expect(json.tokensaver).toEqual({
      rtkEnabled: expect.any(Boolean),
      cavemanEnabled: expect.any(Boolean),
      adhdEnabled: expect.any(Boolean),
      dlpEnabled: expect.any(Boolean),
    });
    expect(json.tokensaver).not.toHaveProperty("soulCustomContent");
    expect(json.tokensaver).not.toHaveProperty("soulFilePath");
    expect(json.providers.codebuddy).not.toHaveProperty("user");
    expect(json.codebuddy).not.toHaveProperty("user");
    if (json.identity.gate.lastRejection) {
      expect(json.identity.gate.lastRejection).not.toHaveProperty("message");
      expect(json.identity.gate.lastRejection).not.toHaveProperty("shape");
    }
    if (json.identity.gate.lastUpstreamError) {
      expect(json.identity.gate.lastUpstreamError).not.toHaveProperty("error");
    }
    if (json.lastUpstreamError) {
      expect(json.lastUpstreamError).not.toHaveProperty("error");
    }
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
