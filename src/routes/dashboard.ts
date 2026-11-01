/**
 * Web Dashboard Route (Svelte 5 Static Bundle Hosting + SSR Metadata)
 */

import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { adminRequestError } from "../core/admin-guard";

export const dashboardRoute = new Hono();

const ROOT_DIST = path.join(process.cwd(), "dist");
const LEGACY_DIST = path.join(process.cwd(), "web", "dist");
const DIST_DIR = fs.existsSync(ROOT_DIST) ? ROOT_DIST : LEGACY_DIST;

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

dashboardRoute.get("*", (c) => {
  const reqPath = c.req.path;

  if (reqPath === "/" || reqPath === "/index.html") {
    const denied = adminRequestError(c);
    if (denied) {
      return c.json({ error: denied }, 403);
    }
  }

  // Serve static assets from dist if present
  if (fs.existsSync(DIST_DIR)) {
    const filePath = path.join(DIST_DIR, reqPath === "/" ? "index.html" : reqPath.slice(1));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      let contentType = "text/html";
      if (ext === ".js") contentType = "application/javascript";
      else if (ext === ".css") contentType = "text/css";
      else if (ext === ".svg") contentType = "image/svg+xml";
      else if (ext === ".png") contentType = "image/png";
      else if (ext === ".json") contentType = "application/json";

      if (reqPath !== "/" && ext !== ".html") {
        return c.body(fs.readFileSync(filePath), 200, { "Content-Type": contentType });
      }
    }

    // SPA index.html with embedded SSR metadata
    const indexHtml = path.join(DIST_DIR, "index.html");
    if (fs.existsSync(indexHtml)) {
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
      if (html.includes("</body>")) {
        html = html.replace("</body>", `${ssrSnippet}\n</body>`);
      } else {
        html += ssrSnippet;
      }
      return c.html(html);
    }
  }

  return c.html("<!doctype html><html><body><h1>AlphaWay</h1><p>Dashboard is loading...</p></body></html>");
});
