/**
 * Egress Proxy Route (/api/proxy)
 * Admin-surface with CSRF protection, Host header validation, and Content-Type enforcement.
 */

import { Hono } from "hono";
import * as egress from "../core/egress";
import { adminRequestError } from "../core/admin-guard";

export const proxyRoute = new Hono();

proxyRoute.use("/api/proxy*", async (c, next) => {
  const denied = adminRequestError(c);
  if (denied) {
    return c.json({ error: denied }, 403);
  }
  if (c.req.method === "POST") {
    const ct = String(c.req.header("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return c.json({ error: "Content-Type must be application/json" }, 415);
    }
  }
  return next();
});

proxyRoute.get("/api/proxy", (c) => {
  return c.json(egress.describe());
});

proxyRoute.post("/api/proxy", async (c) => {
  try {
    const body = await c.req.json();
    if (body.url === undefined && body.pool === undefined) {
      return c.json({ error: "Missing url or pool parameter" }, 400);
    }
    if (body.url !== undefined) {
      const res = egress.setProxyUrl(body.url);
      if (!res.ok) {
        return c.json({ error: res.error }, 400);
      }
    }
    if (body.pool !== undefined) {
      const res = egress.setPool(body.pool, body.strategy);
      if (!res.ok) {
        return c.json({ error: res.error }, 400);
      }
    }
    return c.json(egress.describe());
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

proxyRoute.post("/api/proxy/test", async (c) => {
  try {
    const body = await c.req.json();
    const targetUrl = body.url;
    if (!targetUrl) return c.json({ ok: false, error: "Missing url parameter" }, 400);

    const result = await egress.testProxy(targetUrl, 5000);
    return c.json(result);
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});
