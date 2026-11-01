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
import { proxyRoute } from "./routes/proxy";
import { chatRoute } from "./routes/chat";
import { dashboardRoute } from "./routes/dashboard";
import { customProvidersRoute } from "./routes/custom-providers";
import { usageRoute } from "./routes/usage";
import { settingsRoute } from "./routes/settings";
import soulRoute from "./routes/soul";

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

// Security Headers Middleware (Anti-Clickjacking, CSP, MIME-sniffing protection)
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
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "x-api-key", "x-codebuddy-api-key"],
  exposeHeaders: ["X-Request-ID", "Content-Type"],
}));

// OpenAI Standard API Key Auth Middleware (Optional, enabled via API_KEY env)
function getBridgeApiKey(): string {
  return (process.env.BRIDGE_API_KEY || process.env.API_KEY || "").trim();
}

const authMiddleware = async (c: any, next: any) => {
  const requiredKey = getBridgeApiKey();
  if (!requiredKey) return next();

  const auth = c.req.header("authorization") || c.req.header("Authorization") || "";
  const xApiKey = c.req.header("x-api-key") || c.req.header("api-key") || "";
  let clientKey = "";
  if (auth.startsWith("Bearer ")) clientKey = auth.slice(7).trim();
  else if (auth) clientKey = auth.trim();
  else if (xApiKey) clientKey = xApiKey.trim();

  // Missing API Key check conforming to OpenAI Standard
  if (!clientKey) {
    c.header("WWW-Authenticate", 'Bearer realm="alphaway"');
    return c.json(
      {
        error: {
          message:
            "You didn't provide an API key. You need to provide your API key in an Authorization header using Bearer auth (i.e. Authorization: Bearer YOUR_KEY), or as the value of the x-api-key or api-key request header.",
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key",
        },
      },
      401
    );
  }

  // Validate API key with OpenAI standard sk- normalization
  const isMatch =
    clientKey === requiredKey ||
    (requiredKey.startsWith("sk-") && clientKey === requiredKey) ||
    (!requiredKey.startsWith("sk-") && clientKey === `sk-${requiredKey}`);

  if (!isMatch) {
    c.header("WWW-Authenticate", 'Bearer realm="alphaway"');
    const masked = clientKey.length > 8 ? `${clientKey.slice(0, 4)}...${clientKey.slice(-4)}` : "sk-***";
    return c.json(
      {
        error: {
          message: `Incorrect API key provided: ${masked}. You can find or verify your API key at http://127.0.0.1:20129.`,
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key",
        },
      },
      401
    );
  }
  return next();
};

app.use("/v1/*", authMiddleware);
app.use("/messages", authMiddleware);
app.use("/responses", authMiddleware);
app.use("/response", authMiddleware);

// Mount Modular Routes
app.route("/", healthRoute);
app.route("/", modelsRoute);
app.route("/", tokensaverRoute);
app.route("/", authRoute);
app.route("/", proxyRoute);
app.route("/", customProvidersRoute);
app.route("/", usageRoute);
app.route("/", settingsRoute);
app.route("/api/soul", soulRoute);
app.route("/", chatRoute);
app.route("/", dashboardRoute);
