/**
 * Usage and Token Analytics Engine for AlphaWay
 *
 * Tracks requests, tokens (prompt, completion, total), TokenSaver savings,
 * protocol and model breakdowns, hourly/daily trend buckets, activity heatmap,
 * and recent request audit log.
 * Persists request events and aggregate snapshots in native SQLite.
 */

import { randomUUID } from "node:crypto";
import {
  dbInsertRequestLogWithSnapshot,
  dbClearRequestLogsWithSnapshot,
  dbGetRequestLogById,
  dbGetRecentRequestLogs,
  dbGetSummaryMetrics,
  dbGetModelSummaries,
  dbGetProviderSummaries,
  dbGetProtocolSummaries,
  dbGetDailyUsageHistory,
  dbGetHourlyUsageHistory,
  dbGetSetting,
  dbSetSetting,
} from "./database";

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

export interface ProtocolUsageSummary {
  requests: number;
  tokens: number;
  promptTokens?: number;
  completionTokens?: number;
  lastUsed?: string;
}

export interface ProviderUsageSummary {
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
    openai: ProtocolUsageSummary;
    anthropic: ProtocolUsageSummary;
    responses: ProtocolUsageSummary;
  };
  byProvider: {
    opencode: ProviderUsageSummary;
    codebuddy: ProviderUsageSummary;
    custom: ProviderUsageSummary;
  };
  dailyHistory: Record<string, { requests: number; tokens: number }>;
  hourlyHistory: Record<string, { tokens: number; cost: number; byModel: Record<string, number> }>;
  recentLogs: RequestLogEntry[];
}

const MAX_RECENT_LOGS = 100;

function createEmptyStats(): UsageStats {
  return {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    savedTokens: 0,
    estimatedSavingsUsd: 0,
    byModel: {},
    byProtocol: {
      openai: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
      anthropic: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
      responses: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
    },
    byProvider: {
      opencode: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
      codebuddy: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
      custom: { requests: 0, tokens: 0, promptTokens: 0, completionTokens: 0, lastUsed: "" },
    },
    dailyHistory: {},
    hourlyHistory: {},
    recentLogs: [],
  };
}

let inMemoryStats: UsageStats = loadStatsFromDatabase();

function safeMetric(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(number, Number.MAX_SAFE_INTEGER)) : 0;
}

function safeMetricText(value: unknown, maxLength = 160): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength) : "";
}

function normalizeSummaryMap(value: any, fields: string[]): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, any> = {};
  for (const [key, source] of Object.entries(value).slice(0, 1000)) {
    const safeKey = safeMetricText(key, 128);
    if (!safeKey || !source || typeof source !== "object" || Array.isArray(source)) continue;
    const summary: Record<string, any> = {};
    for (const field of fields) {
      summary[field] = field === "lastUsed" ? safeMetricText((source as any)[field], 64) : safeMetric((source as any)[field]);
    }
    result[safeKey] = summary;
  }
  return result;
}

function normalizeProtocolSummary(value: any, fallback: ProtocolUsageSummary): ProtocolUsageSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...fallback };
  return {
    requests: safeMetric(value.requests),
    tokens: safeMetric(value.tokens),
    promptTokens: safeMetric(value.promptTokens),
    completionTokens: safeMetric(value.completionTokens),
    lastUsed: safeMetricText(value.lastUsed, 64),
  };
}

function normalizeProviderSummary(value: any, fallback: ProviderUsageSummary): ProviderUsageSummary {
  return normalizeProtocolSummary(value, fallback);
}

function normalizeHistory(value: any, kind: "daily" | "hourly"): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, any> = {};
  for (const [key, source] of Object.entries(value).slice(0, 1000)) {
    const safeKey = safeMetricText(key, 32);
    const valid = kind === "daily"
      ? /^\d{4}-\d{2}-\d{2}$/.test(safeKey)
      : /^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(safeKey);
    if (!valid || !source || typeof source !== "object" || Array.isArray(source)) continue;
    if (kind === "daily") {
      result[safeKey] = { requests: safeMetric((source as any).requests), tokens: safeMetric((source as any).tokens) };
    } else {
      const byModel: Record<string, number> = {};
      const sourceModels = (source as any).byModel;
      if (sourceModels && typeof sourceModels === "object" && !Array.isArray(sourceModels)) {
        for (const [model, tokens] of Object.entries(sourceModels).slice(0, 500)) {
          const safeModel = safeMetricText(model, 128);
          if (safeModel) byModel[safeModel] = safeMetric(tokens);
        }
      }
      result[safeKey] = { tokens: safeMetric((source as any).tokens), cost: safeMetric((source as any).cost), byModel };
    }
  }
  return result;
}

function normalizeRecentLogs(value: any): RequestLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_RECENT_LOGS).flatMap((source: any) => {
    if (!source || typeof source !== "object" || Array.isArray(source) || typeof source.timestamp !== "string" || !Number.isFinite(Date.parse(source.timestamp))) return [];
    const promptTokens = safeMetric(source.promptTokens);
    const completionTokens = safeMetric(source.completionTokens);
    return [{
      id: safeMetricText(source.id, 128),
      timestamp: new Date(source.timestamp).toISOString(),
      protocol: ["openai", "anthropic", "responses"].includes(source.protocol) ? source.protocol : "openai",
      model: safeMetricText(source.model) || "unknown",
      provider: ["opencode", "codebuddy", "custom"].includes(source.provider) ? source.provider : "opencode",
      status: Math.min(599, Math.max(100, Math.round(safeMetric(source.status) || 200))),
      latencyMs: safeMetric(source.latencyMs),
      promptTokens,
      completionTokens,
      totalTokens: safeMetric(source.totalTokens) || promptTokens + completionTokens,
      savedTokens: safeMetric(source.savedTokens),
      stream: Boolean(source.stream),
    }];
  });
}

function normalizeStats(parsed: Partial<UsageStats> | null | undefined): UsageStats {
  const defaults = createEmptyStats();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaults;
  return {
    totalRequests: safeMetric(parsed.totalRequests),
    successfulRequests: safeMetric(parsed.successfulRequests),
    failedRequests: safeMetric(parsed.failedRequests),
    totalPromptTokens: safeMetric(parsed.totalPromptTokens),
    totalCompletionTokens: safeMetric(parsed.totalCompletionTokens),
    totalTokens: safeMetric(parsed.totalTokens),
    savedTokens: safeMetric(parsed.savedTokens),
    estimatedSavingsUsd: safeMetric(parsed.estimatedSavingsUsd),
    byModel: normalizeSummaryMap(parsed.byModel, ["requests", "promptTokens", "completionTokens", "totalTokens", "lastUsed"]),
    byProtocol: {
      openai: normalizeProtocolSummary(parsed.byProtocol?.openai, defaults.byProtocol.openai),
      anthropic: normalizeProtocolSummary(parsed.byProtocol?.anthropic, defaults.byProtocol.anthropic),
      responses: normalizeProtocolSummary(parsed.byProtocol?.responses, defaults.byProtocol.responses),
    },
    byProvider: {
      opencode: normalizeProviderSummary(parsed.byProvider?.opencode, defaults.byProvider.opencode),
      codebuddy: normalizeProviderSummary(parsed.byProvider?.codebuddy, defaults.byProvider.codebuddy),
      custom: normalizeProviderSummary(parsed.byProvider?.custom, defaults.byProvider.custom),
    },
    dailyHistory: normalizeHistory(parsed.dailyHistory, "daily"),
    hourlyHistory: normalizeHistory(parsed.hourlyHistory, "hourly"),
    recentLogs: normalizeRecentLogs(parsed.recentLogs),
  };
}
function loadStatsFromDatabase(): UsageStats {
  const stored = dbGetSetting<Partial<UsageStats> | null>("usage_stats_snapshot", null);
  if (stored) {
    const normalized = normalizeStats(stored);
    if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
      try { dbSetSetting("usage_stats_snapshot", normalized); } catch {}
    }
    return normalized;
  }

  // Rebuild the projection from canonical request events when an older SQLite
  // database has request rows but no aggregate snapshot yet.
  const stats = createEmptyStats();
  Object.assign(stats, dbGetSummaryMetrics());
  stats.estimatedSavingsUsd = calculateSavingsUsd(
    stats.totalPromptTokens,
    stats.totalCompletionTokens,
    stats.savedTokens
  );
  stats.byModel = dbGetModelSummaries();
  stats.byProvider = dbGetProviderSummaries();
  stats.byProtocol = dbGetProtocolSummaries();
  stats.dailyHistory = dbGetDailyUsageHistory();
  stats.hourlyHistory = dbGetHourlyUsageHistory();
  stats.recentLogs = dbGetRecentRequestLogs(MAX_RECENT_LOGS) as RequestLogEntry[];
  return stats;
}

export function calculateSavingsUsd(promptTokens: number, completionTokens: number, savedTokens: number): number {
  // Commercial baseline: $2.50 / 1M prompt, $10.00 / 1M completion
  const promptCost = (promptTokens / 1_000_000) * 2.5;
  const completionCost = (completionTokens / 1_000_000) * 10.0;
  const compressionSavings = (savedTokens / 1_000_000) * 2.5;
  return Number((promptCost + completionCost + compressionSavings).toFixed(4));
}

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.8));
}

export function recordRequestUsage(entry: {
  protocol: "openai" | "anthropic" | "responses";
  model: string;
  provider: "opencode" | "codebuddy" | "custom";
  status: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  savedTokens?: number;
  stream?: boolean;
}): RequestLogEntry {
  const prompt = Math.max(0, entry.promptTokens || 0);
  const completion = Math.max(0, entry.completionTokens || 0);
  const total = prompt + completion;
  const saved = Math.max(0, entry.savedTokens || 0);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const id = `req_${randomUUID()}`;

  const logEntry: RequestLogEntry = {
    id,
    timestamp: now,
    protocol: entry.protocol,
    model: entry.model || "unknown",
    provider: entry.provider,
    status: entry.status,
    latencyMs: Math.round(entry.latencyMs),
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    savedTokens: saved,
    stream: Boolean(entry.stream),
  };

  const previousStats = inMemoryStats;
  inMemoryStats = structuredClone(inMemoryStats);

  // Update summary totals
  inMemoryStats.totalRequests += 1;
  if (entry.status >= 200 && entry.status < 300) {
    inMemoryStats.successfulRequests += 1;
  } else {
    inMemoryStats.failedRequests += 1;
  }

  inMemoryStats.totalPromptTokens += prompt;
  inMemoryStats.totalCompletionTokens += completion;
  inMemoryStats.totalTokens += total;
  inMemoryStats.savedTokens += saved;
  inMemoryStats.estimatedSavingsUsd = calculateSavingsUsd(
    inMemoryStats.totalPromptTokens,
    inMemoryStats.totalCompletionTokens,
    inMemoryStats.savedTokens
  );

  // Update byModel
  const modelKey = entry.model || "unknown";
  if (!inMemoryStats.byModel[modelKey]) {
    inMemoryStats.byModel[modelKey] = {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      lastUsed: now,
    };
  }
  const m = inMemoryStats.byModel[modelKey];
  m.requests += 1;
  m.promptTokens += prompt;
  m.completionTokens += completion;
  m.totalTokens += total;
  m.lastUsed = now;

  // Update byProtocol
  const proto = entry.protocol;
  if (inMemoryStats.byProtocol[proto]) {
    const p = inMemoryStats.byProtocol[proto];
    p.requests += 1;
    p.tokens += total;
    p.promptTokens = (p.promptTokens || 0) + prompt;
    p.completionTokens = (p.completionTokens || 0) + completion;
    p.lastUsed = now;
  }

  // Update byProvider
  const prov = entry.provider;
  if (inMemoryStats.byProvider[prov]) {
    const pr = inMemoryStats.byProvider[prov];
    pr.requests += 1;
    pr.tokens += total;
    pr.promptTokens = (pr.promptTokens || 0) + prompt;
    pr.completionTokens = (pr.completionTokens || 0) + completion;
    pr.lastUsed = now;
  }

  // Update daily and hourly histories
  const dateKey = now.slice(0, 10);
  if (!inMemoryStats.dailyHistory) inMemoryStats.dailyHistory = {};
  if (!inMemoryStats.dailyHistory[dateKey]) {
    inMemoryStats.dailyHistory[dateKey] = { requests: 0, tokens: 0 };
  }
  inMemoryStats.dailyHistory[dateKey].requests += 1;
  inMemoryStats.dailyHistory[dateKey].tokens += total;

  const hourKey = now.slice(0, 13) + ":00";
  if (!inMemoryStats.hourlyHistory) inMemoryStats.hourlyHistory = {};
  if (!inMemoryStats.hourlyHistory[hourKey]) {
    inMemoryStats.hourlyHistory[hourKey] = { tokens: 0, cost: 0, byModel: {} };
  }
  const hh = inMemoryStats.hourlyHistory[hourKey];
  hh.tokens += total;
  hh.cost += calculateSavingsUsd(prompt, completion, 0);
  hh.byModel[modelKey] = (hh.byModel[modelKey] || 0) + total;

  // Prepend to ring buffer
  inMemoryStats.recentLogs.unshift(logEntry);
  if (inMemoryStats.recentLogs.length > MAX_RECENT_LOGS) {
    inMemoryStats.recentLogs.length = MAX_RECENT_LOGS;
  }

  try {
    dbInsertRequestLogWithSnapshot(logEntry, inMemoryStats);
  } catch (error) {
    inMemoryStats = previousStats;
    throw error;
  }
  return logEntry;
}

export function getUsageStats(): UsageStats {
  return {
    ...inMemoryStats,
    recentLogs: [...inMemoryStats.recentLogs],
  };
}

export function resetUsageStats(): void {
  const nextStats = createEmptyStats();
  dbClearRequestLogsWithSnapshot(nextStats);
  inMemoryStats = nextStats;
}

export function clearRecentLogs(): void {
  const previousStats = inMemoryStats;
  const nextStats = structuredClone(inMemoryStats);
  nextStats.recentLogs = [];
  try {
    dbClearRequestLogsWithSnapshot(nextStats);
    inMemoryStats = nextStats;
  } catch (error) {
    inMemoryStats = previousStats;
    throw error;
  }
}

export function getRequestLogDetail(id: string): RequestLogEntry | null {
  const inMem = inMemoryStats.recentLogs.find((l) => l.id === id);
  if (inMem) return inMem;
  try {
    return dbGetRequestLogById(id);
  } catch {
    return null;
  }
}

/**
 * Returns bucketed chart data for the SVG Usage Trend Chart.
 * Period presets: 'today' | '24h' | '7d' | '30d' | '60d' | 'all'
 */
export function getUsageChart(period: string = "7d"): ChartBucket[] {
  const now = new Date();
  const buckets: ChartBucket[] = [];

  if (period === "today" || period === "24h") {
    // 24 hourly buckets
    const numHours = 24;
    for (let i = numHours - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600 * 1000);
      const hourStr = d.getHours().toString().padStart(2, "0") + ":00";
      const hourKey = d.toISOString().slice(0, 13) + ":00";
      const hist = inMemoryStats.hourlyHistory?.[hourKey];

      buckets.push({
        label: hourStr,
        tokens: hist?.tokens || 0,
        cost: hist?.cost || 0,
        byModel: hist?.byModel ? { ...hist.byModel } : {},
      });
    }

    // Also fold recentLogs within the hour in case hourlyHistory was fresh
    for (const log of inMemoryStats.recentLogs) {
      const logDate = new Date(log.timestamp);
      const diffMs = now.getTime() - logDate.getTime();
      if (diffMs >= 0 && diffMs < 24 * 3600 * 1000) {
        const hourIdx = 23 - Math.floor(diffMs / (3600 * 1000));
        if (hourIdx >= 0 && hourIdx < buckets.length) {
          const b = buckets[hourIdx];
          if (!b.byModel[log.model]) {
            b.byModel[log.model] = 0;
          }
          // If hourly history was empty, sync from recentLogs
          if (!inMemoryStats.hourlyHistory?.[log.timestamp.slice(0, 13) + ":00"]) {
            b.tokens += log.totalTokens;
            b.cost += calculateSavingsUsd(log.promptTokens, log.completionTokens, 0);
            b.byModel[log.model] += log.totalTokens;
          }
        }
      }
    }
  } else {
    // Daily buckets (7d, 30d, 60d, all)
    const days = period === "30d" ? 30 : period === "60d" || period === "all" ? 60 : 7;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
      const dateKey = d.toISOString().slice(0, 10);
      const label = `${months[d.getMonth()]} ${d.getDate()}`;
      const hist = inMemoryStats.dailyHistory?.[dateKey];

      const bucket: ChartBucket = {
        label,
        tokens: hist?.tokens || 0,
        cost: calculateSavingsUsd((hist?.tokens || 0) * 0.7, (hist?.tokens || 0) * 0.3, 0),
        byModel: {},
      };
      buckets.push(bucket);
    }

    // Distribute recent logs to corresponding daily bucket
    for (const log of inMemoryStats.recentLogs) {
      const logDateKey = log.timestamp.slice(0, 10);
      const logD = new Date(log.timestamp);
      const diffDays = Math.floor((now.getTime() - logD.getTime()) / (24 * 3600 * 1000));
      if (diffDays >= 0 && diffDays < days) {
        const bucketIdx = days - 1 - diffDays;
        if (bucketIdx >= 0 && bucketIdx < buckets.length) {
          const b = buckets[bucketIdx];
          b.byModel[log.model] = (b.byModel[log.model] || 0) + log.totalTokens;
          if (!inMemoryStats.dailyHistory?.[logDateKey]) {
            b.tokens += log.totalTokens;
            b.cost += calculateSavingsUsd(log.promptTokens, log.completionTokens, 0);
          }
        }
      }
    }
  }

  return buckets;
}

/**
 * Returns trailing daily points for the GitHub-style Activity Heatmap and current active streak.
 */
export function getActivityHeatmap(daysCount: number = 84): { daily: UsageDailyPoint[]; streak: number } {
  const now = new Date();
  const daily: UsageDailyPoint[] = [];

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const dateKey = d.toISOString().slice(0, 10);
    const hist = inMemoryStats.dailyHistory?.[dateKey];
    daily.push({
      date: dateKey,
      requests: hist?.requests || 0,
      tokens: hist?.tokens || 0,
    });
  }

  // Calculate current streak
  let streak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].requests > 0) {
      streak++;
    } else {
      // If today has 0 requests yet, allow streak to continue from yesterday
      if (i === daily.length - 1) continue;
      break;
    }
  }

  return { daily, streak };
}
