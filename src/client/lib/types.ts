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

export interface SoulInfoResponse {
  ok: boolean;
  enabled: boolean;
  mode: "auto" | "preset" | "custom";
  preset: string;
  source: "workspace" | "global" | "custom_path" | "custom_content" | "preset" | "none";
  filePath: string | null;
  content: string;
  tokenEstimate: number;
  presets?: {
    atlas: string;
    minimalist: string;
    socratic: string;
  };
}

export interface SystemHealth {
  version: string;
  uptime: number;
  listenPort: number;
  cloudflaredFound: boolean;
  cloudflaredVersion?: string;
  tunnelUrl?: string;
  hasApiKey: boolean;
  proxyConfigured: boolean;
  tokensaverConfigured: boolean;
  platform: string;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
}

export interface ModelItem {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface TokenSaverConfig {
  aggressiveCompression: boolean;
  cavemanEnabled: boolean;
  adhdEnabled: boolean;
  dlpRedaction: boolean;
  maxTokensFloor: number;
  rtkLinesCap: number;
}

export interface HealthResponse {
  status: string;
  version: string;
  identity: any;
  tunnel?: {
    running: boolean;
    url?: string;
  };
  proxy?: {
    configured: boolean;
    url?: string;
  };
  codebuddy?: {
    connected: boolean;
    account?: string;
    modelCount?: number;
  };
  tokensaver?: TokenSaverConfig;
  customProvidersCount?: number;
  requiresApiKey: boolean;
  boringSslParity?: boolean;
}

export type ProxyPoolStrategy = "round-robin" | "failover" | "random";

export interface ProxyPoolEntryStatus {
  id: string;
  label: string;
  host: string | null;
  kind: "direct" | "relay" | "http" | "https" | "proxy";
  enabled: boolean;
  weight: number;
  state: "disabled" | "cooling" | "ready";
  cooldownMsLeft: number;
  cooldownUntil: number;
  failures: number;
  lastError: string | null;
  lastOkAt: number | null;
  lastUsedAt: number | null;
}

export interface ProxyPoolStatus {
  active: boolean;
  size: number;
  enabled: number;
  ready: number;
  cooling: number;
  strategy: ProxyPoolStrategy;
  source: "env" | "database" | "none" | string;
  cooldownMs: number;
  maxCooldownMs: number;
  error: string | null;
  entries: ProxyPoolEntryStatus[];
}

export interface ProxyStatus {
  mode: "direct" | "proxy" | "pool";
  proxy: string | null;
  hasCredentials: boolean;
  source: "env" | "database" | "none" | string;
  locked: boolean;
  configPath: string;
  error: string | null;
  pool: ProxyPoolStatus;
}

export interface ProxyTestResult {
  ok: boolean;
  apiStatus?: number | null;
  exitIp?: string | null;
  latencyMs?: number | null;
  error?: string | null;
  exitError?: string | null;
}

export interface ProxyPoolTestEntryResult {
  id: string;
  label: string;
  host: string | null;
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  apiStatus?: number | null;
  exitIp?: string | null;
  latencyMs?: number | null;
  error?: string | null;
  state?: "ready" | "cooling" | "error";
}

export interface ProxyPoolTestResult {
  ok: boolean;
  entries: ProxyPoolTestEntryResult[];
  error?: string;
}

export interface CodeBuddyOAuthStart {
  state: string;
  authUrl: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_content?: string;
}

export interface CustomProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey?: boolean;
  protocol: "openai" | "anthropic";
  models: string[];
  enabled: boolean;
  headers?: Record<string, string>;
}

export interface RequestLogEntry {
  id: string;
  timestamp: string;
  protocol: "openai" | "anthropic" | "responses";
  model: string;
  provider: "opencode" | "codebuddy" | "custom";
  status: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  savedTokens: number;
  stream: boolean;
  clientApiKeyId?: string | null;
}

export interface ModelUsageSummary {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastUsed: string;
}

export interface BreakdownUsageSummary {
  requests: number;
  tokens: number;
  promptTokens?: number;
  completionTokens?: number;
  lastUsed?: string;
}

export interface ChartBucket {
  label: string;
  tokens: number;
  cost: number;
  byModel: Record<string, number>;
}

export interface UsageDailyPoint {
  date: string;
  requests: number;
  tokens: number;
}

export interface UsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  savedTokens: number;
  estimatedSavingsUsd: number;
  byModel: Record<string, ModelUsageSummary>;
  byProtocol: {
    openai: BreakdownUsageSummary;
    anthropic: BreakdownUsageSummary;
    responses: BreakdownUsageSummary;
  };
  byProvider: {
    opencode: BreakdownUsageSummary;
    codebuddy: BreakdownUsageSummary;
    custom: BreakdownUsageSummary;
  };
  dailyHistory?: Record<string, { requests: number; tokens: number }>;
  hourlyHistory?: Record<string, { tokens: number; cost: number; byModel: Record<string, number> }>;
  recentLogs: RequestLogEntry[];
}
