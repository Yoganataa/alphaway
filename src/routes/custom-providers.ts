/**
 * Custom Providers REST Route (/api/custom-providers)
 */

import { Hono } from "hono";
import {
  loadCustomProviders,
  addOrUpdateCustomProvider,
  deleteCustomProvider,
  getCustomProvider,
  type CustomProvider,
} from "../core/custom-providers";
import { adminRequestError } from "../core/admin-guard";
import { embeddedProviderUrlSecrets, hasEmbeddedProviderUrlSecrets, redactProviderBaseUrl, redactCredentialEchoes } from "../core/provider-url-secrets";

function publicProvider(provider: CustomProvider) {
  const { apiKey, ...safe } = provider;
  return {
    ...safe,
    baseUrl: redactProviderBaseUrl(provider.baseUrl),
    apiKey: "",
    hasApiKey: Boolean(apiKey || hasEmbeddedProviderUrlSecrets(provider.baseUrl)),
  };
}

export const customProvidersRoute = new Hono();

function redactUpstreamError(value: string, secrets: string[]): string {
  return redactCredentialEchoes(value, secrets, 300);
}

// CSRF & Host header protection for admin routes
customProvidersRoute.use("*", async (c, next) => {
  if (c.req.method !== "GET") {
    const denied = adminRequestError(c);
    if (denied) {
      return c.json({ error: denied }, 403);
    }
  }
  await next();
});

// List all registered custom providers
customProvidersRoute.get("/api/custom-providers", (c) => {
  const providers = loadCustomProviders().map(publicProvider);
  return c.json({ providers });
});

// Create or update a custom provider
customProvidersRoute.post("/api/custom-providers", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name || !body.baseUrl) {
      return c.json({ error: "Provider 'name' and 'baseUrl' are required." }, 400);
    }

    const saved = addOrUpdateCustomProvider(body);
    return c.json({ ok: true, provider: publicProvider(saved) });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to save custom provider" }, 500);
  }
});

// Delete a custom provider
customProvidersRoute.delete("/api/custom-providers/:id", (c) => {
  const id = c.req.param("id");
  const deleted = deleteCustomProvider(id);
  if (!deleted) {
    return c.json({ error: `Provider '${id}' not found.` }, 404);
  }
  return c.json({ ok: true, message: `Provider '${id}' removed.` });
});

// Test connection to a custom provider
customProvidersRoute.post("/api/custom-providers/test", async (c) => {
  try {
    const body = await c.req.json();
    const { baseUrl, apiKey, protocol, model } = body;
    const savedProvider = typeof body.id === "string" ? getCustomProvider(body.id) : undefined;
    if (!baseUrl) {
      return c.json({ ok: false, error: "baseUrl is required" }, 400);
    }

    const cleanUrl = baseUrl.trim().replace(/\/+$/, "");
    const suppliedKey = typeof apiKey === "string" ? apiKey.trim() : "";
    const rawKey = suppliedKey || savedProvider?.apiKey || "";
    const cleanKey = rawKey ? (rawKey.startsWith("sk-") ? rawKey : `sk-${rawKey}`) : "";
    const testModel = model || (protocol === "anthropic" ? "claude-3-5-sonnet-20241022" : "gpt-4o-mini");

    if (protocol === "anthropic") {
      const target = cleanUrl.endsWith("/messages") ? cleanUrl : `${cleanUrl}/messages`;
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cleanKey ? { "x-api-key": cleanKey } : {}),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: testModel,
          max_tokens: 10,
          messages: [{ role: "user", content: "ping" }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return c.json({ ok: false, status: res.status, error: redactUpstreamError(text, [cleanKey, rawKey, ...embeddedProviderUrlSecrets(cleanUrl)]) });
      }
      return c.json({ ok: true, status: res.status, message: "Anthropic endpoint reachable!" });
    } else {
      const target = cleanUrl.endsWith("/chat/completions") ? cleanUrl : `${cleanUrl}/chat/completions`;
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {}),
        },
        body: JSON.stringify({
          model: testModel,
          max_tokens: 10,
          messages: [{ role: "user", content: "ping" }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return c.json({
          ok: false,
          status: res.status,
          error: redactUpstreamError(text, [cleanKey, rawKey, ...embeddedProviderUrlSecrets(cleanUrl)]),
        });
      }
      return c.json({ ok: true, status: res.status, message: "OpenAI endpoint reachable!" });
    }
  } catch {
    // Fetch errors may contain a URL with embedded credentials; never echo it.
    return c.json({ ok: false, error: "Connection failed. Verify the endpoint and credentials." }, 500);
  }
});
