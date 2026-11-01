/**
 * TokenSaver Route (/api/tokensaver)
 */

import { Hono } from "hono";
import * as tokensaver from "../features/tokensaver";

export const tokensaverRoute = new Hono();

tokensaverRoute.get("/api/tokensaver", (c) => {
  return c.json(tokensaver.getConfig());
});

tokensaverRoute.post("/api/tokensaver", async (c) => {
  try {
    const body = await c.req.json();
    const updated = tokensaver.saveConfig(body);
    return c.json({ ok: true, config: updated });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 400);
  }
});
