/**
 * Lightweight, typed API client for AlphaWay Hono backend
 */

import type {
  HealthResponse,
  ModelItem,
  TokenSaverConfig,
  ProxyStatus,
  ProxyTestResult,
  ProxyPoolTestResult,
  ProxyPoolStrategy,
  CodeBuddyOAuthStart,
  ChatMessage,
  CustomProviderConfig,
  UsageStats,
  ChartBucket,
  UsageDailyPoint,
  SoulInfoResponse,
} from "./types";

const BASE_URL = "";

export type { ProxyStatus, ProxyTestResult, ProxyPoolTestResult, ProxyPoolStrategy } from "./types";

declare global {
  interface Window {
    __BRIDGE_API_KEY__?: string;
  }
}

export function getActiveApiKey(): string {
  if (typeof window !== "undefined") {
    if (window.__BRIDGE_API_KEY__ && window.__BRIDGE_API_KEY__.trim()) {
      const k = window.__BRIDGE_API_KEY__.trim();
      return k.startsWith("sk-") ? k : `sk-${k}`;
    }
    const stored = sessionStorage.getItem("alphaway_api_key")
      || localStorage.getItem("alphaway_api_key")
      || localStorage.getItem("oc_bridge_api_key");
    if (stored && stored.trim() && stored !== "public") {
      const k = stored.trim();
      return k.startsWith("sk-") ? k : `sk-${k}`;
    }
  }
  return "";
}

export function setActiveApiKey(key: string): void {
  if (typeof window !== "undefined") {
    const trimmed = key.trim();
    if (!trimmed) {
      sessionStorage.removeItem("alphaway_api_key");
      localStorage.removeItem("alphaway_api_key");
      localStorage.removeItem("oc_bridge_api_key");
      return;
    }
    const normalized = trimmed.startsWith("sk-") ? trimmed : `sk-${trimmed}`;
    // Managed credentials are short-lived browser state, not durable local storage.
    sessionStorage.setItem("alphaway_api_key", normalized);
    localStorage.removeItem("alphaway_api_key");
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
}

function isModelItem(value: unknown): value is ModelItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const model = value as Record<string, unknown>;
  return (
    typeof model.id === "string" &&
    typeof model.object === "string" &&
    typeof model.created === "number" &&
    typeof model.owned_by === "string"
  );
}

export async function fetchModels(): Promise<ModelItem[]> {
  const key = getActiveApiKey();
  const res = await fetch(`${BASE_URL}/v1/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Fetch models failed (${res.status})`);
  if (!json || typeof json !== "object" || Array.isArray(json) ||
      !Array.isArray(json.data) || !json.data.every(isModelItem)) {
    throw new Error("Invalid models response");
  }
  return json.data;
}

export async function fetchTokenSaverConfig(): Promise<TokenSaverConfig> {
  const res = await fetch(`${BASE_URL}/api/tokensaver`);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Fetch tokensaver failed (${res.status})`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Fetch tokensaver returned an invalid configuration");
  }
  return data as TokenSaverConfig;
}

export interface SecurityKeywordRule {
  id: string;
  pattern: string;
  action: "mask" | "block";
  description: string;
  enabled: boolean;
}

function isSecurityKeywordRule(value: unknown): value is SecurityKeywordRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.id === "string" &&
    typeof rule.pattern === "string" &&
    (rule.action === "mask" || rule.action === "block") &&
    typeof rule.description === "string" &&
    typeof rule.enabled === "boolean"
  );
}

function readSecurityRulesResponse(data: unknown): SecurityKeywordRule[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid Security Rules response");
  }
  const rules = (data as { rules?: unknown }).rules;
  if (!Array.isArray(rules) || !rules.every(isSecurityKeywordRule)) {
    throw new Error("Invalid Security Rules response");
  }
  return rules;
}

export async function fetchSecurityRules(): Promise<SecurityKeywordRule[]> {
  const res = await fetch(`${BASE_URL}/api/security/rules`);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Fetch security rules failed: ${res.statusText}`);
  return readSecurityRulesResponse(data);
}

export async function saveSecurityRules(
  rules: SecurityKeywordRule[]
): Promise<SecurityKeywordRule[]> {
  const res = await fetch(`${BASE_URL}/api/security/rules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Save security rules failed: ${res.statusText}`);
  }
  return readSecurityRulesResponse(data);
}

export interface PersonaKeyword {
  text: string;
  mode?: "word" | "partial";
}

export interface PersonaPreset {
  id: string;
  name: string;
  prompt: string;
  kind: string;
  source: string;
  keywords: PersonaKeyword[];
  excludes: PersonaKeyword[];
  order: number;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaModelBinding {
  modelId: string;
  enabled: boolean;
  presetId: string | null;
  updatedAt: string;
}

export interface PersonaResolution {
  injected: boolean;
  reason: string;
  presetId?: string;
  presetName?: string;
  prompt?: string;
  keyword?: string;
  matchedModelId?: string;
  detail: string;
}

async function personaRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}/api/persona${path}`, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Persona request failed: ${response.statusText}`);
  return data as T;
}

function isPersonaKeyword(value: unknown): value is PersonaKeyword {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keyword = value as Record<string, unknown>;
  return (
    typeof keyword.text === "string" &&
    keyword.text.trim().length > 0 &&
    (keyword.mode === undefined || keyword.mode === "word" || keyword.mode === "partial")
  );
}

function isPersonaPreset(value: unknown): value is PersonaPreset {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset.id === "string" &&
    typeof preset.name === "string" &&
    typeof preset.prompt === "string" &&
    typeof preset.kind === "string" &&
    typeof preset.source === "string" &&
    Array.isArray(preset.keywords) &&
    preset.keywords.every(isPersonaKeyword) &&
    Array.isArray(preset.excludes) &&
    preset.excludes.every(isPersonaKeyword) &&
    typeof preset.order === "number" &&
    typeof preset.usageCount === "number" &&
    typeof preset.createdAt === "string" &&
    typeof preset.updatedAt === "string"
  );
}

function isPersonaModelBinding(value: unknown): value is PersonaModelBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  return (
    typeof binding.modelId === "string" &&
    typeof binding.enabled === "boolean" &&
    (binding.presetId === null || typeof binding.presetId === "string") &&
    typeof binding.updatedAt === "string"
  );
}

function readPersonaState(data: unknown): {
  presets: PersonaPreset[];
  bindings: PersonaModelBinding[];
  excludes: PersonaKeyword[];
} {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid Persona response");
  }
  const state = data as Record<string, unknown>;
  if (
    !Array.isArray(state.presets) ||
    !state.presets.every(isPersonaPreset) ||
    !Array.isArray(state.bindings) ||
    !state.bindings.every(isPersonaModelBinding) ||
    !Array.isArray(state.excludes) ||
    !state.excludes.every(isPersonaKeyword)
  ) {
    throw new Error("Invalid Persona response");
  }
  return {
    presets: state.presets,
    bindings: state.bindings,
    excludes: state.excludes,
  };
}

export async function fetchPersonaState(): Promise<{
  presets: PersonaPreset[];
  bindings: PersonaModelBinding[];
  excludes: PersonaKeyword[];
}> {
  const data = await personaRequest<unknown>("");
  return readPersonaState(data);
}

export async function savePersonaPreset(preset: Partial<PersonaPreset> & Pick<PersonaPreset, "id" | "name" | "prompt">): Promise<PersonaPreset> {
  const data = await personaRequest<{ preset: PersonaPreset }>("/presets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preset }),
  });
  return data.preset;
}

export async function deletePersonaPreset(id: string): Promise<void> {
  await personaRequest("/presets/" + encodeURIComponent(id), { method: "DELETE" });
}

export async function setPersonaModelBinding(binding: {
  modelId: string;
  enabled: boolean;
  presetId: string | null;
}): Promise<PersonaModelBinding> {
  const data = await personaRequest<{ binding: PersonaModelBinding }>("/models", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(binding),
  });
  return data.binding;
}

export async function deletePersonaModelBinding(modelId: string): Promise<void> {
  await personaRequest("/models", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId }),
  });
}

export async function savePersonaGlobalExcludes(excludes: PersonaKeyword[]): Promise<PersonaKeyword[]> {
  const data = await personaRequest<unknown>("/excludes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ excludes }),
  });
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid Persona exclusions response");
  }
  const returned = (data as { excludes?: unknown }).excludes;
  if (!Array.isArray(returned) || !returned.every(isPersonaKeyword)) {
    throw new Error("Invalid Persona exclusions response");
  }
  return returned;
}

export async function resolvePersona(modelIds: string[]): Promise<PersonaResolution> {
  const data = await personaRequest<{ resolution: PersonaResolution }>("/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelIds }),
  });
  return data.resolution;
}

export async function previewPersona(modelIds: string[], messages: any[]): Promise<{
  resolution: PersonaResolution;
  messages: any[];
}> {
  return personaRequest<{ resolution: PersonaResolution; messages: any[] }>("/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelIds, messages }),
  });
}

export async function inspectSecurityPrompt(text: string): Promise<{
  ok: boolean;
  output: string;
  blocked: { id: string; pattern: string; action: "block"; description: string } | null;
  maskedRuleIds: string[];
}> {
  const response = await fetch(`${BASE_URL}/api/security/inspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Security inspection failed: ${response.statusText}`);
  return data;
}

export async function fetchSoulConfig(): Promise<SoulInfoResponse> {
  const res = await fetch(`${BASE_URL}/api/soul`);
  if (!res.ok) throw new Error(`Fetch soul failed: ${res.statusText}`);
  return res.json();
}

export async function updateSoulConfig(data: {
  enabled?: boolean;
  mode?: "auto" | "preset" | "custom";
  preset?: string;
  filePath?: string;
  customContent?: string;
  saveToFile?: boolean;
  targetPath?: string;
  content?: string;
}): Promise<SoulInfoResponse> {
  const res = await fetch(`${BASE_URL}/api/soul`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Update soul failed: ${res.statusText}`);
  return res.json();
}

export async function previewSoulPrompt(prompt: string, soulContent?: string): Promise<{
  ok: boolean;
  prompt: string;
  formattedSoul: string;
  enrichedMessages: any[];
  tokenEstimate: number;
}> {
  const res = await fetch(`${BASE_URL}/api/soul/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, soulContent }),
  });
  if (!res.ok) throw new Error(`Preview soul failed: ${res.statusText}`);
  return res.json();
}

export async function updateTokenSaverConfig(
  config: Partial<TokenSaverConfig>
): Promise<TokenSaverConfig> {
  const res = await fetch(`${BASE_URL}/api/tokensaver`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Update tokensaver failed (${res.status})`);
  if (!data || typeof data !== "object" || Array.isArray(data) || data.ok !== true ||
      !data.config || typeof data.config !== "object" || Array.isArray(data.config)) {
    throw new Error("Update tokensaver returned an invalid configuration response");
  }
  return data.config as TokenSaverConfig;
}

function parseProxyStatus(data: unknown): ProxyStatus {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  const isNullableString = (value: unknown): value is string | null =>
    value === null || typeof value === "string";
  const isNullableNumber = (value: unknown): value is number | null =>
    value === null || isFiniteNumber(value);
  const strategies = ["round-robin", "random", "failover"];
  const entryKinds = ["direct", "relay", "http", "https", "proxy"];
  const entryStates = ["disabled", "cooling", "ready"];

  const validEntries = isRecord(data) && isRecord(data.pool) && Array.isArray(data.pool.entries) &&
    data.pool.entries.every((entry: unknown) => isRecord(entry) &&
      typeof entry.id === "string" &&
      typeof entry.label === "string" &&
      isNullableString(entry.host) &&
      typeof entry.kind === "string" && entryKinds.includes(entry.kind) &&
      typeof entry.enabled === "boolean" &&
      isFiniteNumber(entry.weight) &&
      typeof entry.state === "string" && entryStates.includes(entry.state) &&
      isFiniteNumber(entry.cooldownMsLeft) &&
      isFiniteNumber(entry.cooldownUntil) &&
      isFiniteNumber(entry.failures) &&
      isNullableString(entry.lastError) &&
      isNullableNumber(entry.lastOkAt) &&
      isNullableNumber(entry.lastUsedAt));

  if (
    !isRecord(data) ||
    !["direct", "proxy", "pool"].includes(String(data.mode)) ||
    (typeof data.proxy !== "string" && data.proxy !== null) ||
    typeof data.hasCredentials !== "boolean" ||
    typeof data.source !== "string" ||
    typeof data.locked !== "boolean" ||
    typeof data.configPath !== "string" ||
    !isNullableString(data.error) ||
    !isRecord(data.pool) ||
    typeof data.pool.active !== "boolean" ||
    !strategies.includes(String(data.pool.strategy)) ||
    typeof data.pool.source !== "string" ||
    !["size", "enabled", "ready", "cooling", "cooldownMs", "maxCooldownMs"].every((field) =>
      isFiniteNumber(data.pool[field]) && Number(data.pool[field]) >= 0) ||
    !isNullableString(data.pool.error) ||
    !validEntries
  ) {
    throw new Error("Invalid proxy configuration response");
  }
  return data as unknown as ProxyStatus;
}

export async function fetchProxyStatus(): Promise<ProxyStatus> {
  const res = await fetch(`${BASE_URL}/api/proxy`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Fetch proxy failed (HTTP ${res.status})`);
  }
  return parseProxyStatus(data);
}

export async function updateProxy(url: string): Promise<ProxyStatus> {
  const res = await fetch(`${BASE_URL}/api/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Update proxy failed: ${res.statusText}`);
  return parseProxyStatus(data);
}

export interface ProxyPoolEntryInput {
  id?: string;
  label?: string;
  url?: string;
  relay?: boolean;
  token?: string;
  direct?: boolean;
  enabled?: boolean;
  weight?: number;
}

export interface ProxyPoolUpdate {
  entries: ProxyPoolEntryInput[];
  strategy?: ProxyPoolStrategy;
  cooldownMs?: number;
  maxCooldownMs?: number;
}

export async function updateProxyPool(config: ProxyPoolUpdate): Promise<ProxyStatus> {
  const res = await fetch(`${BASE_URL}/api/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pool: config }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Update proxy pool failed: ${res.statusText}`);
  return parseProxyStatus(data);
}

export async function testProxyPool(options: { timeoutMs?: number; entryId?: string } = {}): Promise<ProxyPoolTestResult> {
  const res = await fetch(`${BASE_URL}/api/proxy/pool/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Proxy pool test failed: ${res.statusText}`);
  return data;
}

export async function testProxy(url: string): Promise<ProxyTestResult> {
  const res = await fetch(`${BASE_URL}/api/proxy/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: data?.error || res.statusText };
  return data;
}

export async function startCodeBuddyOAuth(): Promise<CodeBuddyOAuthStart> {
  const res = await fetch(`${BASE_URL}/api/codebuddy/oauth/start`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`OAuth start failed: ${res.statusText}`);
  return res.json();
}

export async function pollCodeBuddyOAuth(
  state: string
): Promise<{ status: "pending" | "success" | "error"; message?: string }> {
  const res = await fetch(`${BASE_URL}/api/codebuddy/oauth/poll?state=${encodeURIComponent(state)}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `OAuth poll failed: ${res.statusText}`);
  return data;
}

function isCustomProviderConfig(value: unknown): value is CustomProviderConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const provider = value as Record<string, unknown>;
  return (
    typeof provider.id === "string" &&
    typeof provider.name === "string" &&
    typeof provider.baseUrl === "string" &&
    typeof provider.apiKey === "string" &&
    (provider.protocol === "openai" || provider.protocol === "anthropic") &&
    Array.isArray(provider.models) &&
    provider.models.every((model) => typeof model === "string") &&
    typeof provider.enabled === "boolean" &&
    (provider.hasApiKey === undefined || typeof provider.hasApiKey === "boolean")
  );
}

export async function fetchCustomProviders(): Promise<CustomProviderConfig[]> {
  const res = await fetch(`${BASE_URL}/api/custom-providers`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Failed to load custom providers (${res.status})`);
  if (!json || typeof json !== "object" || Array.isArray(json) ||
      !Array.isArray(json.providers) || !json.providers.every(isCustomProviderConfig)) {
    throw new Error("Invalid custom providers response");
  }
  return json.providers;
}

export async function saveCustomProvider(
  provider: Partial<CustomProviderConfig>
): Promise<{ ok: boolean; provider: CustomProviderConfig }> {
  const res = await fetch(`${BASE_URL}/api/custom-providers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(provider),
  });
  if (!res.ok) throw new Error(`Failed to save custom provider: ${res.statusText}`);
  return res.json();
}

export async function deleteCustomProvider(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE_URL}/api/custom-providers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete custom provider: ${res.statusText}`);
  return res.json();
}

export interface CustomProviderTestResult {
  ok: boolean;
  status?: number;
  message?: string;
  error?: string;
  requestStatus: number;
}

export async function testCustomProvider(
  provider: Partial<CustomProviderConfig> & { model?: string }
): Promise<CustomProviderTestResult> {
  const res = await fetch(`${BASE_URL}/api/custom-providers/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(provider),
  });
  const data = await res.json().catch(() => null) as Omit<CustomProviderTestResult, "requestStatus"> | null;
  if (!data || typeof data !== "object" || typeof data.ok !== "boolean") {
    throw new Error(`Invalid custom-provider probe response (HTTP ${res.status})`);
  }
  return { ...data, requestStatus: res.status };
}

export async function fetchUsageStats(): Promise<UsageStats> {
  const res = await fetch(`${BASE_URL}/api/usage`);
  if (!res.ok) throw new Error(`Failed to load usage stats: ${res.statusText}`);
  return res.json();
}

export async function fetchUsageChart(period: string = "7d"): Promise<ChartBucket[]> {
  const res = await fetch(`${BASE_URL}/api/usage/chart?period=${encodeURIComponent(period)}`);
  if (!res.ok) throw new Error(`Failed to load usage chart: ${res.statusText}`);
  return res.json();
}

export async function fetchActivityHeatmap(days: number = 84): Promise<{ daily: UsageDailyPoint[]; streak: number }> {
  const res = await fetch(`${BASE_URL}/api/usage/heatmap?days=${days}`);
  if (!res.ok) throw new Error(`Failed to load activity heatmap: ${res.statusText}`);
  return res.json();
}

export async function fetchRequestDetail(id: string): Promise<RequestLogEntry> {
  const res = await fetch(`${BASE_URL}/api/usage/details/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to load request detail: ${res.statusText}`);
  return res.json();
}

export async function resetUsageStats(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/api/usage/reset`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to reset usage: ${res.statusText}`);
  return res.json();
}

export async function clearRecentLogs(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/api/usage/clear-logs`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to clear logs: ${res.statusText}`);
  return res.json();
}

export const resetUsage = resetUsageStats;
export const clearLogs = clearRecentLogs;

/**
 * Stream a chat completion request via Server-Sent Events
 */
export async function* streamChatCompletion(params: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}): AsyncGenerator<{ content?: string; reasoning_content?: string; done?: boolean }, void, unknown> {
  const key = getActiveApiKey();
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      stream: true,
      temperature: params.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Chat error (${res.status}): ${errorText || res.statusText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;

      if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") {
          yield { done: true };
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta;
          if (delta) {
            yield {
              content: delta.content || "",
              reasoning_content: delta.reasoning_content || "",
            };
          }
        } catch {
          // ignore partial JSON parse error
        }
      }
    }
  }
}

export interface AdminAuthStatus {
  configured: boolean;
  setupRequired: boolean;
}

async function adminAuthRequest(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "same-origin",
    headers: { ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Administrator request failed: ${res.statusText}`);
  return data;
}

export function fetchAdminAuthStatus(): Promise<AdminAuthStatus> {
  return adminAuthRequest("/api/admin/auth/status");
}

export function fetchAdminSession(): Promise<{ authenticated: boolean; user: { username: string } | null }> {
  return adminAuthRequest("/api/admin/auth/session");
}

export function bootstrapAdmin(input: { bootstrapToken: string; username: string; password: string }): Promise<any> {
  return adminAuthRequest("/api/admin/auth/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function loginAdmin(username: string, password: string): Promise<any> {
  return adminAuthRequest("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export function logoutAdmin(): Promise<{ ok: boolean }> {
  return adminAuthRequest("/api/admin/auth/logout", { method: "POST" });
}

export interface APIKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number | null;
  requestsCount: number;
  totalTokensUsed: number;
  planId: string | null;
  planName: string | null;
  rateLimitRpm: number | null;
  rateLimitTpm: number | null;
  concurrencyLimit: number | null;
  tokenQuota: number | null;
  allowedModels: string[] | null;
  effectiveRpmLimit: number;
  effectiveTpmLimit: number;
  effectiveConcurrencyLimit: number;
  effectiveTokenQuota: number;
  effectiveAllowedModels: string[];
  status: "active" | "revoked";
}

export type ManagedKeyUsageWindowName = "1h" | "24h" | "7d" | "30d";

export interface ManagedKeyUsageWindowItem {
  clientApiKeyId: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface PlanRecord {
  id: string;
  name: string;
  description: string;
  rpmLimit: number;
  tpmLimit: number;
  concurrencyLimit: number;
  tokenQuota: number;
  allowedModels: string[];
  createdAt: number;
  updatedAt: number;
}

export type PlanInput = Omit<PlanRecord, "id" | "createdAt" | "updatedAt">;
export type APIKeyPolicyPatch = {
  planId?: string | null;
  rateLimitRpm?: number | null;
  rateLimitTpm?: number | null;
  concurrencyLimit?: number | null;
  tokenQuota?: number | null;
  allowedModels?: string[] | null;
};

async function plansRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(BASE_URL + path, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Plan request failed: " + response.statusText);
  return data as T;
}

function isPlanRecord(value: unknown): value is PlanRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  return (
    typeof plan.id === "string" &&
    typeof plan.name === "string" &&
    typeof plan.description === "string" &&
    typeof plan.rpmLimit === "number" &&
    typeof plan.tpmLimit === "number" &&
    typeof plan.concurrencyLimit === "number" &&
    typeof plan.tokenQuota === "number" &&
    Array.isArray(plan.allowedModels) &&
    plan.allowedModels.every((model) => typeof model === "string") &&
    typeof plan.createdAt === "number" &&
    typeof plan.updatedAt === "number"
  );
}

export async function fetchPlans(): Promise<PlanRecord[]> {
  const data = await plansRequest<unknown>("/api/plans");
  const plans = (data as { plans?: unknown } | null)?.plans;
  if (!Array.isArray(plans) || !plans.every(isPlanRecord)) {
    throw new Error("Invalid Plans response");
  }
  return plans;
}

export async function createPlan(input: PlanInput): Promise<PlanRecord> {
  const data = await plansRequest<{ plan: PlanRecord }>("/api/plans", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  return data.plan;
}

export async function updatePlan(id: string, input: Partial<PlanInput>): Promise<PlanRecord> {
  const data = await plansRequest<{ plan: PlanRecord }>("/api/plans/" + encodeURIComponent(id), {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  return data.plan;
}

export async function deletePlan(id: string): Promise<void> {
  await plansRequest("/api/plans/" + encodeURIComponent(id), { method: "DELETE" });
}

export async function setApiKeyPolicy(id: string, patch: APIKeyPolicyPatch): Promise<APIKeyRecord> {
  const data = await plansRequest<{ key: APIKeyRecord }>("/api/keys/" + encodeURIComponent(id) + "/policy", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
  return data.key;
}

export interface IssuedAPIKey extends APIKeyRecord {
  secret: string;
}

export interface ConsoleLogItem {
  seq: number;
  time: string;
  level: "info" | "warn" | "error" | "debug";
  line: string;
}

export interface DatabaseStats {
  engine: string;
  mode: string;
  path: string;
  sizeKb: number;
  requestLogsCount: number;
  customProvidersCount: number;
  databaseSizeBytes?: number;
  reclaimableBytes?: number;
  walSizeBytes?: number;
  pageCount?: number;
  pageSize?: number;
  freelistCount?: number;
  journalMode?: string;
  busyTimeoutMs?: number;
}

export async function fetchApiKeys(): Promise<APIKeyRecord[]> {
  const res = await fetch(`${BASE_URL}/api/keys`);
  if (!res.ok) throw new Error(`Failed to load API keys: ${res.statusText}`);
  const data = await res.json();
  return data.keys || [];
}

export async function fetchManagedKeyUsageWindow(
  window: ManagedKeyUsageWindowName = "24h",
): Promise<ManagedKeyUsageWindowItem[]> {
  const response = await fetch(`${BASE_URL}/api/keys/usage?window=${encodeURIComponent(window)}`);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Failed to load managed key usage: ${response.statusText}`);
  return data?.items || [];
}

export async function createApiKey(name: string): Promise<IssuedAPIKey> {
  const res = await fetch(`${BASE_URL}/api/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Failed to create API key: ${res.statusText}`);
  return data.key;
}

export async function updateApiKeyLabel(id: string, name: string): Promise<APIKeyRecord> {
  const res = await fetch(`${BASE_URL}/api/keys/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Failed to update API key: ${res.statusText}`);
  return data.key;
}

export async function rotateApiKey(id: string): Promise<IssuedAPIKey> {
  const res = await fetch(`${BASE_URL}/api/keys/${encodeURIComponent(id)}/rotate`, { method: "POST" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Failed to rotate API key: ${res.statusText}`);
  return data.key;
}

export async function deleteApiKey(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Failed to revoke API key: ${res.statusText}`);
}

export async function fetchConsoleLogs(): Promise<ConsoleLogItem[]> {
  const res = await fetch(`${BASE_URL}/api/console-logs`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Failed to load console logs (HTTP ${res.status})`);
  }
  if (!data || !Array.isArray(data.logs)) {
    throw new Error("Invalid console logs response");
  }
  return data.logs as ConsoleLogItem[];
}

export async function clearConsoleLogs(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/console-logs/clear`, {
    method: "POST",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Failed to clear console logs (HTTP ${res.status})`);
  }
}

export async function fetchDatabaseStats(): Promise<DatabaseStats> {
  const res = await fetch(`${BASE_URL}/api/settings/database/stats`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Failed to load database stats (HTTP ${res.status})`);
  }
  if (
    !data ||
    typeof data.engine !== "string" ||
    typeof data.mode !== "string" ||
    typeof data.path !== "string" ||
    typeof data.sizeKb !== "number" ||
    typeof data.requestLogsCount !== "number" ||
    typeof data.customProvidersCount !== "number"
  ) {
    throw new Error("Invalid database statistics response");
  }
  return data as DatabaseStats;
}

export async function downloadDatabaseBackup(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/settings/database/backup`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Failed to create database backup: ${res.statusText}`);
  }

  const disposition = res.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || "alphaway-database.sqlite.awenc";
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return filename;
}

export async function vacuumDatabase(): Promise<DatabaseStats & { ok: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/api/settings/database/vacuum`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to vacuum database: ${res.statusText}`);
  return res.json();
}

