/**
 * Egress Proxy & Failover Pool Engine
 * Native TypeScript interface for AlphaWay
 */

import type { EgressState, ProxyConfig, PoolHealth } from "../types";

// Re-export core operations from proxy module with full typing
const proxy = require("./proxy");

export const ENV_OVERRIDE: string | null = proxy.ENV_OVERRIDE;
export const POOL_ENV: string | null = proxy.POOL_ENV;
export const STRATEGY_ENV: string | null = proxy.STRATEGY_ENV;

export function configFile(): string {
  return proxy.configFile();
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

export function parsePoolSpec(spec: any): any[] {
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

export function setPool(spec: any, strategy?: string): any {
  return proxy.setPool(spec, strategy);
}

export function pick(options?: any): any {
  return proxy.pick(options);
}

export function markFailure(target: any, status?: number): void {
  proxy.markFailure(target, status);
}

export function markSuccess(target: any): void {
  proxy.markSuccess(target);
}

export function resetHealth(): void {
  proxy.resetHealth();
}

export function withProxy(options?: any): any {
  return proxy.withProxy(options);
}

export async function netFetch(url: string | URL, init?: any): Promise<Response> {
  return proxy.netFetch(url, init);
}

export async function testProxy(rawUrl: string, timeoutMs?: number): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  return proxy.testProxy(rawUrl, timeoutMs);
}

export async function testPool(entry: any, timeoutMs?: number): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  return proxy.testPool(entry, timeoutMs);
}
