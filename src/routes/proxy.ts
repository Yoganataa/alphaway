/**
 * Egress Proxy Route (/api/proxy)
 * Admin-surface with CSRF protection, Host header validation, and Content-Type enforcement.
 */

import { Hono } from "hono";
import * as egress from "../core/egress";
import { adminRequestError, readJsonRequestBody } from "../core/admin-guard";

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
    const body = await readJsonRequestBody(c.req);
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "A JSON object is required" }, 400);

    const hasUrl = Object.prototype.hasOwnProperty.call(body, "url");
    const hasPool = Object.prototype.hasOwnProperty.call(body, "pool");
    if (hasUrl === hasPool) {
      return c.json({ error: "Provide exactly one of url or pool; combined updates are not atomic." }, 400);
    }

    if (hasUrl) {
      const result = egress.setProxyUrl(body.url);
      if (!result.ok) return c.json({ error: result.error }, 400);
    } else {
      const rawPool = body.pool;
      const spec = Array.isArray(rawPool)
        ? { entries: rawPool, ...(body.strategy !== undefined ? { strategy: body.strategy } : {}) }
        : rawPool && typeof rawPool === "object" && !Array.isArray(rawPool)
          ? { ...rawPool, ...(body.strategy !== undefined ? { strategy: body.strategy } : {}) }
          : rawPool;
      const result = egress.setPool(spec);
      if (!result.ok) return c.json({ error: result.error }, 400);
    }

    return c.json(egress.describe());
  } catch (err: any) {
    const status = err?.statusCode === 413 ? 413 : 400;
    return c.json({ error: status === 413 ? "Request body exceeds the 10 MiB limit" : err.message }, status);
  }
});

proxyRoute.post("/api/proxy/test", async (c) => {
  try {
    const body = await readJsonRequestBody(c.req);
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "A JSON object is required" }, 400);
    const targetUrl = body.url;
    if (!targetUrl) return c.json({ ok: false, error: "Missing url parameter" }, 400);

    const result = await egress.testProxy(targetUrl, 5000);
    return c.json(result);
  } catch (err: any) {
    const status = err?.statusCode === 413 ? 413 : 500;
    return c.json({ ok: false, error: status === 413 ? "Request body exceeds the 10 MiB limit" : err.message }, status);
  }
});

proxyRoute.post("/api/proxy/pool/test", async (c) => {
  try {
    const body = await readJsonRequestBody(c.req);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ ok: false, error: "A JSON object is required" }, 400);
    }

    const timeoutMs = body.timeoutMs === undefined ? 15000 : Number(body.timeoutMs);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
      return c.json({ ok: false, error: "timeoutMs must be an integer between 1000 and 30000" }, 400);
    }
    const entryId = body.entryId === undefined ? undefined : String(body.entryId);
    if (entryId !== undefined && (!entryId.trim() || entryId.length > 64)) {
      return c.json({ ok: false, error: "entryId must be 1-64 characters" }, 400);
    }

    const result = await egress.testPool({ timeoutMs, entryId });
    if (result.error) return c.json(result, 404);
    return c.json(result);
  } catch (err: any) {
    const status = err?.statusCode === 413 ? 413 : 500;
    return c.json({ ok: false, error: status === 413 ? "Request body exceeds the 10 MiB limit" : "Proxy pool probe failed." }, status);
  }
});
