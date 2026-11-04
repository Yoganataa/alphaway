/**
 * Egress Proxy & Failover Pool Engine
 * Native TypeScript interface for AlphaWay
 */

// Keep the wrapper aligned with the runtime proxy module contract.
const proxy = require("./proxy");

export interface PoolTestOptions {
  timeoutMs?: number;
  entryId?: string;
}

export interface PoolTestEntryResult {
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

export interface PoolTestResult {
  ok: boolean;
  entries: PoolTestEntryResult[];
  error?: string;
}

export const ENV_OVERRIDE: string | null = proxy.ENV_OVERRIDE;
export const POOL_ENV: string | null = proxy.POOL_ENV;
export const STRATEGY_ENV: string | null = proxy.STRATEGY_ENV;

export function configFile(): string {
  return proxy.configStore();
}

export function healthFile(): string {
  return proxy.healthFile();
}

export function parseProxyUrl(raw: string | null | undefined): { ok: boolean; url?: string; error?: string } {
  return proxy.parseProxyUrl(raw);
}

export function parsePoolEntry(raw: any, index?: number): any {
  return proxy.parsePoolEntry(raw, index);
}

export function parsePoolSpec(spec: string): { entries: any[]; errors: string[] } {
  return proxy.parsePoolSpec(spec);
}

export function parseRelayUrl(raw: string): any {
  return proxy.parseRelayUrl(raw);
}

export function isRelayUrl(raw: string): boolean {
  return proxy.isRelayUrl(raw);
}

export function isRelaySpec(raw: string): boolean {
  return proxy.isRelaySpec(raw);
}

export function displayHost(urlStr: string | null | undefined): string | null {
  return proxy.displayHost(urlStr);
}

export function getProxyUrl(): string | null {
  return proxy.getProxyUrl();
}

export function getPool(): any {
  return proxy.getPool();
}

export function describe(): any {
  return proxy.describe();
}

export function setProxyUrl(raw: string | null): any {
  return proxy.setProxyUrl(raw);
}

export function setPool(spec: unknown): any {
  return proxy.setPool(spec);
}

export function pick(options?: any): any {
  return proxy.pick(options);
}

export function markFailure(
  target: string,
  options?: { reason?: string; now?: number; cooldownMs?: number | null }
): any {
  return proxy.markFailure(target, options);
}

export function markSuccess(target: string, options?: { now?: number }): any {
  return proxy.markSuccess(target, options);
}

export function resetHealth(): void {
  proxy.resetHealth();
}

export function withProxy(init?: any, egressUrl?: string | null): any {
  return proxy.withProxy(init, egressUrl);
}

export async function netFetch(url: string | URL, init?: any): Promise<Response> {
  return proxy.netFetch(url, init);
}

export async function testProxy(
  rawUrl: string,
  timeoutMs = 15000
): Promise<{ ok: boolean; apiStatus?: number; exitIp?: string | null; latencyMs?: number; error?: string; exitError?: string | null }> {
  return proxy.testProxy(rawUrl, { timeoutMs });
}

export async function testPool(options: PoolTestOptions = {}): Promise<PoolTestResult> {
  return proxy.testPool(options);
}
