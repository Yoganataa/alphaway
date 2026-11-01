/**
 * 3rd-Party Custom Provider Management Engine for AlphaWay
 *
 * Allows operators to configure external AI providers (OpenRouter, DeepSeek,
 * Anthropic, Ollama, vLLM, etc.) supporting both OpenAI and Anthropic formats.
 */

import { openAIToAnthropicRequest } from "./protocol-translator";
import {
  dbLoadCustomProviders,
  dbSaveCustomProvider,
  dbDeleteCustomProvider,
} from "./database";

export interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: "openai" | "anthropic";
  models: string[];
  enabled: boolean;
  createdAt?: number;
}

export function loadCustomProviders(): CustomProvider[] {
  return dbLoadCustomProviders();
}

export function saveCustomProviders(providers: CustomProvider[]): void {
  for (const provider of providers) {
    dbSaveCustomProvider(provider);
  }
}

export function getCustomProvider(id: string): CustomProvider | undefined {
  const providers = loadCustomProviders();
  return providers.find((p) => p.id === id);
}

export function addOrUpdateCustomProvider(provider: Partial<CustomProvider> & { name: string; baseUrl: string }): CustomProvider {
  const providers = loadCustomProviders();
  const id = provider.id || provider.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 32);
  const existingIndex = providers.findIndex((p) => p.id === id);
  const existing = existingIndex >= 0 ? providers[existingIndex] : undefined;

  // An empty API key on an edit means "keep the current credential".
  let apiKey = typeof provider.apiKey === "string" ? provider.apiKey.trim() : "";
  if (apiKey && !apiKey.startsWith("sk-") && apiKey !== "none") {
    apiKey = `sk-${apiKey}`;
  }
  if (!apiKey || apiKey === "none") apiKey = existing?.apiKey || "";

  const baseUrl = (provider.baseUrl || "").trim().replace(/\/+$/, "");
  const updated: CustomProvider = {
    id,
    name: provider.name.trim(),
    baseUrl,
    apiKey,
    protocol: provider.protocol === "anthropic" ? "anthropic" : "openai",
    models: Array.isArray(provider.models) && provider.models.length > 0 ? provider.models : ["default-model"],
    enabled: provider.enabled !== false,
    createdAt: existing?.createdAt || Date.now(),
  };

  if (existingIndex >= 0) providers[existingIndex] = updated;
  else providers.push(updated);

  saveCustomProviders(providers);
  return updated;
}

export function deleteCustomProvider(id: string): boolean {
  return dbDeleteCustomProvider(id);
}

/**
 * Resolves a model name to a registered custom provider.
 * Supports exact match or namespace prefix: `${provider.id}/${model}`
 */
export function findCustomProviderForModel(modelName: string): {
  provider: CustomProvider;
  actualModel: string;
} | null {
  const providers = loadCustomProviders().filter((p) => p.enabled);

  // 1. Check for prefix routing: "deepseek/deepseek-chat"
  const slashIdx = modelName.indexOf("/");
  if (slashIdx > 0) {
    const prefix = modelName.slice(0, slashIdx);
    const suffix = modelName.slice(slashIdx + 1);
    const matched = providers.find((p) => p.id.toLowerCase() === prefix.toLowerCase());
    if (matched) {
      return { provider: matched, actualModel: suffix };
    }
  }

  // 2. Check for exact model match in provider's model list
  for (const p of providers) {
    if (p.models.includes(modelName)) {
      return { provider: p, actualModel: modelName };
    }
  }

  return null;
}

/**
 * Dispatches an OpenAI Chat Completion request to a 3rd party custom provider.
 * Supports both OpenAI and Anthropic upstream wire protocols.
 */
export async function forwardToCustomProvider(
  provider: CustomProvider,
  actualModel: string,
  body: {
    messages: any[];
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
  }
): Promise<Response> {
  const isAnthropic = provider.protocol === "anthropic";

  if (isAnthropic) {
    // Anthropic Upstream
    const anthropicUrl = provider.baseUrl.endsWith("/messages")
      ? provider.baseUrl
      : `${provider.baseUrl}/messages`;

    const anthropicPayload = openAIToAnthropicRequest({
      model: actualModel,
      messages: body.messages,
      max_tokens: body.max_tokens,
      temperature: body.temperature,
      stream: body.stream,
    });

    return fetch(anthropicUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicPayload),
    });
  } else {
    // OpenAI Upstream
    const openAiUrl = provider.baseUrl.endsWith("/chat/completions")
      ? provider.baseUrl
      : `${provider.baseUrl}/chat/completions`;

    const openAiPayload = {
      model: actualModel,
      messages: body.messages,
      stream: Boolean(body.stream),
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens,
    };

    return fetch(openAiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(openAiPayload),
    });
  }
}
