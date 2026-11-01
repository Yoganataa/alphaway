/**
 * Dashboard static hosting.
 *
 * The default path is relative to this module so it resolves both from the
 * source tree and from Bun's embedded filesystem in a compiled executable.
 * Set ALPHAWAY_DASHBOARD_DIR only when intentionally serving external assets.
 */

import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { adminRequestError } from "../core/admin-guard";

export const dashboardRoute = new Hono();

const configuredDist = process.env.ALPHAWAY_DASHBOARD_DIR?.trim();
const isStandalone = typeof Bun !== "undefined" && Bun.isStandaloneExecutable;
const DIST_DIR = configuredDist
  ? path.resolve(configuredDist)
  : path.resolve(import.meta.dir, isStandalone ? "../dist" : "../../dist");

if (process.env.ALPHAWAY_DEBUG_ASSETS === "1") {
  console.info("[AlphaWay] dashboard asset diagnostics", {
    standalone: isStandalone,
    moduleDir: import.meta.dir,
    distDir: DIST_DIR,
    distExists: fs.existsSync(DIST_DIR),
    distEntries: fs.existsSync(DIST_DIR) ? fs.readdirSync(DIST_DIR) : [],
    embeddedFiles: isStandalone
      ? (Bun.embeddedFiles || []).map((asset: File) => ({ name: asset.name, size: asset.size }))
      : [],
  });
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

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

function resolveAssetPath(reqPath: string): string | null {
  const relativePath = reqPath === "/" ? "index.html" : reqPath.replace(/^\/+/, "");
  const resolved = path.resolve(DIST_DIR, relativePath);
  if (resolved !== DIST_DIR && !resolved.startsWith(DIST_DIR + path.sep)) return null;
  return resolved;
}

dashboardRoute.get("*", (c) => {
  const reqPath = c.req.path;

  if (reqPath === "/" || reqPath === "/index.html") {
    const denied = adminRequestError(c);
    if (denied) return c.json({ error: denied }, 403);
  }

  if (!fs.existsSync(DIST_DIR)) {
    return c.html(
      "<!doctype html><html><body><h1>AlphaWay</h1><p>Dashboard assets are not built.</p></body></html>",
      503
    );
  }

  const filePath = resolveAssetPath(reqPath);
  if (!filePath) return c.text("Not found", 404);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();

    // Let the SPA fallback render the main document so runtime metadata is
    // injected consistently for "/" and client-side navigation paths.
    if (reqPath !== "/" && ext !== ".html") {
      const headers: Record<string, string> = {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      };
      if (reqPath.startsWith("/assets/")) {
        headers["Cache-Control"] = "public, max-age=31536000, immutable";
      } else {
        headers["Cache-Control"] = "public, max-age=3600";
      }
      return c.body(fs.readFileSync(filePath), 200, headers);
    }
  }

  const indexHtml = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(indexHtml)) {
    return c.text("Dashboard entry point is missing.", 503);
  }

  let html = fs.readFileSync(indexHtml, "utf8");
  const publicEp = getPublicEndpoint();
  const apiKey = getBridgeApiKey();
  const host = c.req.header("host") || "127.0.0.1:20129";
  const endpointUrl = publicEp
    ? (publicEp.endsWith("/v1") ? publicEp : publicEp + "/v1")
    : `http://${host}/v1`;
  const authText = apiKey ? "Wajib (dikonfigurasi via API_KEY)" : "Opsional (publik)";

  const ssrSnippet = `
<div id="ssr-metadata" style="display:none" aria-hidden="true">
  <span id="ssr-endpoint">${endpointUrl}</span>
  <span id="ssr-auth-text">${authText}</span>
  <span id="ssr-api-key">${apiKey || "sk-alphaway-free"}</span>
  <input type="text" id="proxy-url" />
  <button id="save"></button>
  <div id="report" aria-live="polite"></div>
</div>
`;
  if (html.includes("</body>")) html = html.replace("</body>", `${ssrSnippet}\n</body>`);
  else html += ssrSnippet;

  return c.html(html, 200, { "Cache-Control": "no-cache" });
});
