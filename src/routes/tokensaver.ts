/**
 * TokenSaver Route (/api/tokensaver)
 */

import { Hono } from "hono";
import * as tokensaver from "../features/tokensaver";
import { readJsonRequestBody } from "../core/admin-guard";

export const tokensaverRoute = new Hono();

tokensaverRoute.get("/api/tokensaver", (c) => {
  return c.json(tokensaver.getConfig());
});

tokensaverRoute.post("/api/tokensaver", async (c) => {
  try {
    const body = await readJsonRequestBody(c.req);
    if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ ok: false, error: "A JSON object is required" }, 400);
    const updated = tokensaver.saveConfig(body);
    return c.json({ ok: true, config: updated });
  } catch (err: any) {
    const status = err?.statusCode === 413 ? 413 : 400;
    return c.json({ ok: false, error: status === 413 ? "Request body exceeds the 10 MiB limit" : err.message }, status);
  }
});
