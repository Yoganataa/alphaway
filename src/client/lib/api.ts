/**
 * Lightweight, typed API client for AlphaWay Hono backend
 */

import type {
  HealthResponse,
  ModelItem,
  TokenSaverConfig,
  ProxyStatus,
  ProxyTestResult,
  CodeBuddyOAuthStart,
  ChatMessage,
  CustomProviderConfig,
  UsageStats,
  ChartBucket,
  UsageDailyPoint,
  SoulInfoResponse,
} from "./types";

const BASE_URL = "";

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

export async function fetchModels(): Promise<ModelItem[]> {
  const key = getActiveApiKey();
  const res = await fetch(`${BASE_URL}/v1/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  if (!res.ok) throw new Error(`Fetch models failed: ${res.statusText}`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchTokenSaverConfig(): Promise<TokenSaverConfig> {
  const res = await fetch(`${BASE_URL}/api/tokensaver`);
  if (!res.ok) throw new Error(`Fetch tokensaver failed: ${res.statusText}`);
  return res.json();
}

export interface SecurityKeywordRule {
  id: string;
  pattern: string;
  action: "mask" | "block";
  description: string;
  enabled: boolean;
}

export async function fetchSecurityRules(): Promise<SecurityKeywordRule[]> {
  const res = await fetch(`${BASE_URL}/api/security/rules`);
  if (!res.ok) throw new Error(`Fetch security rules failed: ${res.statusText}`);
  const data = await res.json();
  return data.rules || [];
}

export async function saveSecurityRules(
  rules: SecurityKeywordRule[]
): Promise<SecurityKeywordRule[]> {
  const res = await fetch(`${BASE_URL}/api/security/rules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Save security rules failed: ${res.statusText}`);
  }
  const data = await res.json();
  return data.rules || [];
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
  if (!res.ok) throw new Error(`Update tokensaver failed: ${res.statusText}`);
  return res.json();
}

export async function fetchProxyStatus(): Promise<ProxyStatus> {
  const res = await fetch(`${BASE_URL}/api/proxy`);
  if (!res.ok) throw new Error(`Fetch proxy failed: ${res.statusText}`);
  return res.json();
}

export async function updateProxy(url: string): Promise<{ ok: boolean; url: string }> {
  const res = await fetch(`${BASE_URL}/api/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Update proxy failed: ${res.statusText}`);
  return res.json();
}

export async function testProxy(url: string): Promise<ProxyTestResult> {
  const res = await fetch(`${BASE_URL}/api/proxy/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: errText || res.statusText };
  }
  return res.json();
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

export async function fetchCustomProviders(): Promise<CustomProviderConfig[]> {
  const res = await fetch(`${BASE_URL}/api/custom-providers`);
  if (!res.ok) throw new Error(`Failed to load custom providers: ${res.statusText}`);
  const json = await res.json();
  return json.providers || [];
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

export async function testCustomProvider(
  provider: Partial<CustomProviderConfig>
): Promise<{ ok: boolean; error?: string; latencyMs?: number; modelsCount?: number }> {
  const res = await fetch(`${BASE_URL}/api/custom-providers/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(provider),
  });
  return res.json();
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
  allowedModels: string[] | null;
  status: "active" | "revoked";
  planId: string | null;
  planName: string | null;
  rateLimitRpm: number | null;
  rateLimitTpm: number | null;
  concurrencyLimit: number | null;
  allowedModels: string[] | null;
  totalTokensUsed: number;
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
  if (!res.ok) throw new Error(`Failed to load console logs: ${res.statusText}`);
  const data = await res.json();
  return data.logs || [];
}

export async function clearConsoleLogs(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/console-logs/clear`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to clear console logs: ${res.statusText}`);
}

export async function fetchDatabaseStats(): Promise<DatabaseStats> {
  const res = await fetch(`${BASE_URL}/api/settings/database/stats`);
  if (!res.ok) throw new Error(`Failed to load database stats: ${res.statusText}`);
  return res.json();
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

