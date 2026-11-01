/**
 * Health Route (/health)
 * High-fidelity health report with gate diagnostic, upstream status, and endpoint details.
 */

import { Hono } from "hono";
import * as codebuddy from "../providers/codebuddy";
import * as opencode from "../providers/opencode";
import * as tokensaver from "../features/tokensaver";
import * as egress from "../core/egress";
import * as identity from "../core/identity";

export const healthRoute = new Hono();

function getPublicEndpoint(): string {
  const raw = (
    process.env.PUBLIC_URL ||
    process.env.TUNNEL_URL ||
    process.env.CF_TUNNEL_ENDPOINT ||
    process.env.TUNNEL_HOST ||
    process.env.CF_TUNNEL_HOST ||
    ""
  ).trim();
  if (!raw) return "";
  const withProto = raw.includes("://") ? raw : "https://" + raw;
  return withProto.replace(/\/+$/, "");
}

function getBridgeApiKey(): string {
  return (process.env.BRIDGE_API_KEY || process.env.API_KEY || "").trim();
}

healthRoute.get("/health", (c) => {
  const codebuddyKey = process.env.CODEBUDDY_API_KEY || process.env.CODEBUDDY_TOKEN || "";
  const apiKey = getBridgeApiKey();
  const publicEp = getPublicEndpoint();
  const host = c.req.header("host") || "127.0.0.1:20129";
  const idState = identity.getState();
  const proxyState = egress.describe();

  const publicUrl = publicEp
    ? (publicEp.endsWith("/v1") ? publicEp : publicEp + "/v1")
    : `http://${host}/v1`;

  return c.json({
    status: "ok",
    provider: "alphaway",
    service: "alphaway",
    version: "0.0.1",
    runtime: typeof Bun !== "undefined" ? `bun/${Bun.version}` : "bun/native",
    tls: "BoringSSL Native Parity",
    framework: "Hono.js",
    discoveredModels: opencode.getActiveModels().length,
    auth: {
      required: Boolean(apiKey),
    },
    authRequired: Boolean(apiKey),
    endpoint: {
      publicUrl,
      tunnel: Boolean(publicEp),
    },
    providers: {
      opencode: {
        status: "online",
        type: "free-tier",
        diagnostics: opencode.getGateDiagnostic() || "healthy",
      },
      codebuddy: {
        status: codebuddyKey ? "connected" : "unauthenticated",
        user: codebuddy.extractJwtSub(codebuddyKey) || null,
        models: codebuddy.CODEBUDDY_MODELS.length,
      },
    },
    codebuddy: {
      supported: true,
      configured: Boolean(codebuddyKey),
      endpoint: process.env.CODEBUDDY_INTL_URL || codebuddy.CODEBUDDY_INTL_URL,
      models: codebuddy.CODEBUDDY_MODELS.map((m: any) => m.id),
      user: codebuddy.extractJwtSub(codebuddyKey) || null,
    },
    egress: {
      mode: proxyState.mode.includes("pool")
        ? proxyState.mode
        : proxyState.mode === "proxy"
          ? "proxy"
          : proxyState.mode === "relay"
            ? "relay"
            : "direct",
      proxy: proxyState,
    },
    tokensaver: tokensaver.getConfig(),
    identity: {
      userAgent: idState.userAgent,
      updateMode: idState.updateMode,
      sourceTag: idState.lastSourceTag,
      versionFloor: idState.versionFloor,
      lastCheckAgeMs: idState.lastCheckTime ? Date.now() - idState.lastCheckTime : null,
      ttlMs: idState.ttlMs,
      lastError: idState.lastRefreshError,
      release: idState.release,
      available: idState.available,
      gate: {
        ...opencode.getGateStatus(),
        anchors: {
          tools: identity.GATE_ANCHOR_TOOL_NAMES.slice(),
          headers: identity.GATE_ANCHOR_HEADER_NAMES.slice(),
        },
        lastRejection: opencode.getGateDiagnostic() || null,
        lastUpstreamError: opencode.getLastUpstreamError() || null,
      },
    },
    lastUpstreamError: opencode.getLastUpstreamError() || null,
  });
});
