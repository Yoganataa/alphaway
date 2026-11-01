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
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
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
