/**
 * 3rd-Party Custom Providers Tests
 */

import { describe, it, expect } from "bun:test";
import { app } from "../src/app";
import { adminRequest } from "./helpers/admin";
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

  it("cleans up test custom provider", () => {
    const deleted = deleteCustomProvider("test-deepseek");
    expect(deleted).toBe(true);
    const list = loadCustomProviders();
    expect(list.some((p) => p.id === "test-deepseek")).toBe(false);
  });
});
