/**
 * 3rd-Party Custom Providers Tests
 */

import { describe, it, expect } from "bun:test";
import { app } from "../src/app";
import { adminRequest } from "./helpers/admin";
import { issueAPIKey, revokeAPIKey } from "../src/core/api-keys";
import { getDatabase } from "../src/core/database";
import {
  addOrUpdateCustomProvider,
  loadCustomProviders,
  deleteCustomProvider,
  findCustomProviderForModel,
} from "../src/core/custom-providers";

describe("3rd-Party Custom Providers Engine", () => {
  const testProvider = {
    id: "test-deepseek",
    name: "DeepSeek Official",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "sk-test-deepseek-key-12345",
    protocol: "openai" as const,
    models: ["test-custom-chat", "test-custom-coder"],
    enabled: true,
  };

  it("saves and loads custom providers", () => {
    const saved = addOrUpdateCustomProvider(testProvider);
    expect(saved.id).toBe("test-deepseek");
    expect(saved.apiKey).toBe("sk-test-deepseek-key-12345");
    expect(saved.models).toContain("test-custom-chat");

    const list = loadCustomProviders();
    const found = list.find((p) => p.id === "test-deepseek");
    expect(found).toBeDefined();
    expect(found?.baseUrl).toBe("https://api.deepseek.com/v1");
  });

  it("resolves model by exact name and by prefix namespace", () => {
    // Exact match
    const exact = findCustomProviderForModel("test-custom-chat");
    expect(exact).not.toBeNull();
    expect(exact?.provider.id).toBe("test-deepseek");
    expect(exact?.actualModel).toBe("test-custom-chat");

    // Prefix match
    const prefixed = findCustomProviderForModel("test-deepseek/deepseek-reasoner");
    expect(prefixed).not.toBeNull();
    expect(prefixed?.provider.id).toBe("test-deepseek");
    expect(prefixed?.actualModel).toBe("deepseek-reasoner");
  });

  it("lists custom providers via REST API", async () => {
    const res = await adminRequest("/api/custom-providers");
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(Array.isArray(json.providers)).toBe(true);
    expect(json.providers.some((p: any) => p.id === "test-deepseek")).toBe(true);
  });

  it("encrypts embedded provider URL credentials and redacts them from dashboard responses", async () => {
    const id = "test-embedded-url-secrets";
    const originalUrl = "https://url-user:url-password@provider.example.test/v1?api_key=url-query-secret&tenant=team-a";
    const safeUrl = "https://provider.example.test/v1?tenant=team-a";

    addOrUpdateCustomProvider({
      id,
      name: "Embedded URL Credential Test",
      baseUrl: originalUrl,
      apiKey: "",
      protocol: "openai",
      models: ["embedded-url-model"],
      enabled: true,
    });

    const stored = getDatabase().prepare("SELECT base_url FROM custom_providers WHERE id = ?").get(id).base_url;
    expect(stored).toMatch(/^awenc:v1:/);
    expect(stored).not.toContain("url-user");
    expect(stored).not.toContain("url-password");
    expect(stored).not.toContain("url-query-secret");
    expect(loadCustomProviders().find((provider) => provider.id === id)?.baseUrl).toBe(originalUrl);

    const response = await adminRequest("/api/custom-providers");
    expect(response.status).toBe(200);
    const body: any = await response.json();
    const publicRecord = body.providers.find((provider: any) => provider.id === id);
    expect(publicRecord.baseUrl).toBe(safeUrl);
    expect(publicRecord.hasApiKey).toBe(true);
    expect(JSON.stringify(publicRecord)).not.toContain("url-user");
    expect(JSON.stringify(publicRecord)).not.toContain("url-password");
    expect(JSON.stringify(publicRecord)).not.toContain("url-query-secret");

    // A metadata-only edit made with the redacted URL must not drop the
    // encrypted original URL credential behind the dashboard form.
    addOrUpdateCustomProvider({
      id,
      name: "Embedded URL Credential Test Updated",
      baseUrl: safeUrl,
      apiKey: "",
      protocol: "openai",
      models: ["embedded-url-model"],
      enabled: true,
    });
    expect(loadCustomProviders().find((provider) => provider.id === id)?.baseUrl).toBe(originalUrl);
    deleteCustomProvider(id);
  });

  it("redacts custom-provider API credentials from chat upstream error bodies", async () => {
    const providerId = "test-secret-redaction";
    const providerSecret = "sk-custom-provider-secret-123456789";
    const upstreamKey = issueAPIKey("Custom provider redaction test");
    addOrUpdateCustomProvider({
      id: providerId,
      name: "Secret Redaction Test",
      baseUrl: "https://provider.example.test/v1",
      apiKey: providerSecret,
      protocol: "openai",
      models: ["secret-redaction-model"],
      enabled: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://provider.example.test/v1/chat/completions");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(`Bearer ${providerSecret}`);
      return new Response(JSON.stringify({ error: { message: `Rejected key ${providerSecret}` } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const response = await app.request("/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${upstreamKey.secret}`,
        },
        body: JSON.stringify({
          model: "secret-redaction-model",
          messages: [{ role: "user", content: "Test error redaction" }],
        }),
      });
      expect(response.status).toBe(401);
      const body = await response.text();
      expect(body).not.toContain(providerSecret);
      expect(body).toContain("[REDACTED]");
    } finally {
      globalThis.fetch = originalFetch;
      deleteCustomProvider(providerId);
      revokeAPIKey(upstreamKey.record.id);
    }
  });

  it("cleans up test custom provider", () => {
    const deleted = deleteCustomProvider("test-deepseek");
    expect(deleted).toBe(true);
    const list = loadCustomProviders();
    expect(list.some((p) => p.id === "test-deepseek")).toBe(false);
  });
});
