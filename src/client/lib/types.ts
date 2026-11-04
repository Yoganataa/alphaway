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
  rtkEnabled: boolean;
  rtkMaxLines: number;
  rtkDeduplicate: boolean;
  cavemanEnabled: boolean;
  cavemanLevel: "lite" | "full" | "ultra";
  cavemanLang: "auto" | "en" | "id";
  cavemanAutoClarity: boolean;
  cavemanInputMode: boolean;
  adhdEnabled: boolean;
  adhdLevel: "lite" | "full";
  soulEnabled: boolean;
  soulMode: "auto" | "preset" | "custom";
  soulPreset: string;
  soulFilePath: string;
  soulCustomContent: string;
  dlpEnabled: boolean;
  maskSecrets: boolean;
  maskPaths: boolean;
  sanitizeMarkdownImages: boolean;
  blockDangerousCommands: boolean;
}

export interface TokenSaverHealthSummary {
  rtkEnabled: boolean;
  cavemanEnabled: boolean;
  adhdEnabled: boolean;
  dlpEnabled: boolean;
}

export interface HealthGateRejection {
  at: number | null;
  kind: string;
  status: number | null;
  logId: string | null;
  model: string | null;
  shapeOk?: boolean;
  missing?: string[];
}

export interface HealthGateStatus {
  status: "ip-blocked" | "throttled" | "open";
  ipBlockedSince: number | null;
  throttledUntil: number | null;
  cooldownMs: number;
  anchors: {
    tools: string[];
    headers: string[];
  };
  lastRejection: HealthGateRejection | null;
  lastUpstreamError: HealthUpstreamError | null;
}

export interface HealthUpstreamError {
  at: number | null;
  status: number | null;
  model: string | null;
  logId: string | null;
  cfRay: string | null;
  cfPlacement: string | null;
}

export interface EgressPoolHealthEntry {
  id: string;
  label: string;
  host: string;
  enabled: boolean;
  weight: number;
  state: "disabled" | "cooling" | "ready" | string;
  cooldownMsLeft: number;
  cooldownUntil: number;
  failures: number;
  lastError: string | null;
  lastOkAt: number | null;
  lastUsedAt: number | null;
}

export interface EgressHealthDescription {
  mode: string;
  proxy: string;
  hasCredentials: boolean;
  source: string;
  locked: boolean;
  configPath: string;
  error: string | null;
  pool: {
    active: boolean;
    size: number;
    enabled: number;
    ready: number;
    cooling: number;
    strategy: string;
    source: string;
    cooldownMs: number;
    maxCooldownMs: number;
    error: string | null;
    entries: EgressPoolHealthEntry[];
  };
}

export interface HealthResponse {
  status: string;
  provider: string;
  service: string;
  version: string;
  runtime: string;
  tls: string;
  framework: string;
  uptimeSeconds: number;
  discoveredModels: number;
  auth: { required: boolean };
  authRequired: boolean;
  endpoint: {
    publicUrl: string;
    tunnel: boolean;
  };
  providers: {
    opencode: {
      status: string;
      type: string;
      diagnostics: string;
    };
    codebuddy: {
      status: "connected" | "unauthenticated" | string;
      models: number;
    };
  };
  codebuddy: {
    supported: boolean;
    configured: boolean;
    endpoint: string;
    models: string[];
  };
  egress: {
    mode: string;
    proxy: EgressHealthDescription;
  };
  tokensaver: TokenSaverHealthSummary;
  identity: {
    userAgent: string;
    updateMode: string;
    sourceTag: string | null;
    versionFloor: string | null;
    lastCheckAgeMs: number | null;
    ttlMs: number;
    lastError: string | null;
    release: unknown;
    available: unknown;
    gate: HealthGateStatus;
  };
  lastUpstreamError: HealthUpstreamError | null;
}

export interface ProxyStatus {
  active: boolean;
  url?: string;
  verified?: boolean;
  latencyMs?: number;
}

export interface ProxyTestResult {
  ok: boolean;
  status?: number;
  latencyMs?: number;
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
