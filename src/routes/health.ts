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
import { getCodeBuddyApiKey } from "../core/codebuddy-credentials";

export const healthRoute = new Hono();

function publicUpstreamError(value: any) {
  if (!value || typeof value !== "object") return null;
  return {
    at: Number.isFinite(value.at) ? value.at : null,
    statusCode: Number.isInteger(value.statusCode) ? value.statusCode : null,
    model: typeof value.model === "string" ? value.model.slice(0, 200) : null,
    logId: typeof value.logId === "string" ? value.logId.slice(0, 128) : null,
  };
}

function publicGateRejection(value: any) {
  if (!value || typeof value !== "object") return null;
  return {
    at: Number.isFinite(value.at) ? value.at : null,
    kind: typeof value.kind === "string" ? value.kind.slice(0, 64) : "upstream-rejection",
    status: Number.isInteger(value.status) ? value.status : null,
    logId: typeof value.logId === "string" ? value.logId.slice(0, 128) : null,
    model: typeof value.model === "string" ? value.model.slice(0, 200) : null,
    ...(typeof value.shapeOk === "boolean" ? { shapeOk: value.shapeOk } : {}),
    ...(Array.isArray(value.missing)
      ? { missing: value.missing.filter((item: unknown) => typeof item === "string").slice(0, 20) }
      : {}),
  };
}

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

healthRoute.get("/health", (c) => {
  const codebuddyKey = getCodeBuddyApiKey() || process.env.CODEBUDDY_TOKEN || "";
  const publicEp = getPublicEndpoint();
  const host = c.req.header("host") || "127.0.0.1:20129";
  const idState = identity.getState();
  const proxyState = egress.describe();

  const publicUrl = publicEp
    ? (publicEp.endsWith("/v1") ? publicEp : publicEp + "/v1")
    : `http://${host}/v1`;

  return c.json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    provider: "alphaway",
    service: "alphaway",
    version: "0.0.1",
    runtime: typeof Bun !== "undefined" ? `bun/${Bun.version}` : "bun/native",
    tls: "BoringSSL Native Parity",
    framework: "Hono.js",
    discoveredModels: opencode.getActiveModels().length,
    auth: {
      required: true,
    },
    authRequired: true,
    endpoint: {
      publicUrl,
      tunnel: Boolean(publicEp),
    },
    providers: {
      opencode: {
        status: "online",
        type: "free-tier",
        diagnostics: opencode.getGateDiagnostic() ? "upstream-gate-rejection-recorded" : "healthy",
      },
      codebuddy: {
        status: codebuddyKey ? "connected" : "unauthenticated",
        models: codebuddy.CODEBUDDY_MODELS.length,
      },
    },
    codebuddy: {
      supported: true,
      configured: Boolean(codebuddyKey),
      endpoint: process.env.CODEBUDDY_INTL_URL || codebuddy.CODEBUDDY_INTL_URL,
      models: codebuddy.CODEBUDDY_MODELS.map((m: any) => m.id),
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
    // /health is public. Never include custom SOUL prompts or local paths here.
    tokensaver: {
      rtkEnabled: tokensaver.getConfig().rtkEnabled,
      cavemanEnabled: tokensaver.getConfig().cavemanEnabled,
      adhdEnabled: tokensaver.getConfig().adhdEnabled,
      dlpEnabled: tokensaver.getConfig().dlpEnabled,
    },
    identity: {
      userAgent: idState.userAgent,
      updateMode: idState.updateMode,
      sourceTag: idState.lastSourceTag,
      versionFloor: idState.versionFloor,
      lastCheckAgeMs: idState.lastCheckTime ? Date.now() - idState.lastCheckTime : null,
      ttlMs: idState.ttlMs,
      lastError: idState.lastRefreshError ? "Identity refresh failed" : null,
      release: idState.release,
      available: idState.available,
      gate: {
        ...opencode.getGateStatus(),
        anchors: {
          tools: identity.GATE_ANCHOR_TOOL_NAMES.slice(),
          headers: identity.GATE_ANCHOR_HEADER_NAMES.slice(),
        },
        lastRejection: publicGateRejection(opencode.getGateDiagnostic()),
        lastUpstreamError: publicUpstreamError(opencode.getLastUpstreamError()),
      },
    },
    lastUpstreamError: publicUpstreamError(opencode.getLastUpstreamError()),
  });
});
