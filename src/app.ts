/**
 * AlphaWay Hono.js Application Engine (TypeScript)
 * High-performance, modular API Gateway running natively on Bun with BoringSSL TLS.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { modelsRoute } from "./routes/models";
import { healthRoute } from "./routes/health";
import { tokensaverRoute } from "./routes/tokensaver";
import { authRoute } from "./routes/auth";
import { adminAuthRoute } from "./routes/admin-auth";
import { proxyRoute } from "./routes/proxy";
import { chatRoute } from "./routes/chat";
import { dashboardRoute } from "./routes/dashboard";
import { customProvidersRoute } from "./routes/custom-providers";
import { usageRoute } from "./routes/usage";
import { settingsRoute } from "./routes/settings";
import soulRoute from "./routes/soul";
import personaRoute from "./routes/persona";
import { adminRequestError } from "./core/admin-guard";
import { findActiveAPIKey, recordAPIKeyUse, verifyEnvironmentAPIKey } from "./core/api-keys";
import { resolveEffectivePolicy } from "./core/policy";
import { readAdminSessionCookie, resolveAdminSession } from "./core/admin-auth";

export const app = new Hono();

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") return true;
    const configured = String(process.env.CORS_ORIGIN || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (configured.includes(origin.toLowerCase()) || configured.includes(host)) return true;
  } catch {}
  return false;
}

// Global Middleware
app.use("*", logger());

// Security Headers Middleware (Anti-Clickjacking, MIME-sniffing protection)
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");
  const path = c.req.path;
  if (path === "/" || path === "/index.html" || path.startsWith("/assets")) {
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://open.devest.live; frame-ancestors 'none';"
    );
  }
});

app.use("*", cors({
  origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "x-api-key", "api-key", "x-codebuddy-api-key"],
  exposeHeaders: ["X-Request-ID", "Content-Type"],
}));

// Every administrative API is private by default. Only the minimal bootstrap,
// login, status and session endpoints are reachable without an admin session.
const PUBLIC_ADMIN_AUTH_PATHS = new Set([
  "/api/admin/auth/status",
  "/api/admin/auth/session",
  "/api/admin/auth/bootstrap",
  "/api/admin/auth/login",
  // Legacy OpenAI-compatible chat alias uses a gateway API key, not an admin session.
  "/api/chat",
]);

app.use("/api/*", async (c, next) => {
  if (c.req.method === "OPTIONS" || PUBLIC_ADMIN_AUTH_PATHS.has(c.req.path)) {
    return next();
  }

  const originDenied = adminRequestError(c);
  if (originDenied) return c.json({ error: originDenied, code: "admin_origin_rejected" }, 403);

  const identity = resolveAdminSession(readAdminSessionCookie(c));
  if (!identity) {
    return c.json({
      error: "Administrator authentication is required to access this resource.",
      code: "admin_auth_required",
    }, 401);
  }

  return next();
});

// Gateway caller authentication. Environment keys remain supported for existing
// deployments; managed keys are one-way hashed in SQLite and can be revoked.
function getBridgeApiKey(): string {
  return (process.env.BRIDGE_API_KEY || process.env.API_KEY || "").trim();
}

const authMiddleware = async (c: any, next: any) => {
  const auth = c.req.header("authorization") || c.req.header("Authorization") || "";
  const xApiKey = c.req.header("x-api-key") || c.req.header("api-key") || "";
  let clientKey = "";
  if (auth.startsWith("Bearer ")) clientKey = auth.slice(7).trim();
  else if (auth) clientKey = auth.trim();
  else if (xApiKey) clientKey = xApiKey.trim();

  if (!clientKey) {
    c.header("WWW-Authenticate", 'Bearer realm="alphaway"');
    return c.json({
      error: {
        message: "Provide an API key using Authorization: Bearer <key>, x-api-key, or api-key.",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      },
    }, 401);
  }

  const environmentKey = getBridgeApiKey();
  const environmentMatch = environmentKey
    ? verifyEnvironmentAPIKey(clientKey, environmentKey)
    : false;
  const managedCredential = environmentMatch ? null : findActiveAPIKey(clientKey);

  if (!environmentMatch && !managedCredential) {
    c.header("WWW-Authenticate", 'Bearer realm="alphaway"');
    return c.json({
      error: {
        message: "The supplied API key is invalid, expired, or revoked.",
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      },
    }, 401);
  }

  if (managedCredential) {
    if (!managedCredential.scopes.includes("inference")) {
      return c.json({
        error: {
          message: "This API key does not have permission to access inference endpoints.",
          type: "permission_error",
          param: null,
          code: "insufficient_scope",
        },
      }, 403);
    }
    let effectivePolicy;
    try {
      effectivePolicy = resolveEffectivePolicy(managedCredential.id);
    } catch {
      return c.json({ error: { message: "API key policy could not be resolved", type: "server_error", code: "policy_unavailable" } }, 503);
    }
    if (!effectivePolicy) {
      return c.json({ error: { message: "API key policy could not be resolved", type: "server_error", code: "policy_unavailable" } }, 503);
    }
    c.set("managedApiKeyId", managedCredential.id);
    c.set("effectivePolicy", effectivePolicy);
    recordAPIKeyUse(managedCredential.id);
  } else {
    c.set("managedApiKeyId", null);
    c.set("effectivePolicy", null);
  }

  return next();
};

app.use("/v1/*", authMiddleware);
app.use("/chat/completions", authMiddleware);
app.use("/api/chat", authMiddleware);
app.use("/messages", authMiddleware);
app.use("/responses", authMiddleware);
app.use("/response", authMiddleware);

// Mount Modular Routes
app.route("/", adminAuthRoute);
app.route("/", healthRoute);
app.route("/", modelsRoute);
app.route("/", tokensaverRoute);
app.route("/", authRoute);
app.route("/", proxyRoute);
app.route("/", customProvidersRoute);
app.route("/", usageRoute);
app.route("/", settingsRoute);
app.route("/api/soul", soulRoute);
app.route("/api/persona", personaRoute);
app.route("/api/jailbreak", personaRoute);
app.route("/", chatRoute);
app.route("/", dashboardRoute);
