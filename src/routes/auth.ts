/**
 * Authentication & OAuth Route (/api/auth/* and /api/codebuddy/oauth/*)
 * Handles Provider OAuth Device Flow (CodeBuddy, etc.)
 */

import { Hono } from "hono";
import fs from "fs";
import path from "path";
import * as codebuddy from "../providers/codebuddy";

export const authRoute = new Hono();

// CodeBuddy OAuth Start
authRoute.post("/api/codebuddy/oauth/start", async (c) => {
  try {
    const res = await codebuddy.startCodebuddyOAuth();
    return c.json({ ok: true, ...res });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// CodeBuddy OAuth Poll
authRoute.get("/api/codebuddy/oauth/poll", async (c) => {
  const state = c.req.query("state");
  if (!state) return c.json({ ok: false, error: "Missing state query param" }, 400);

  try {
    const res = await codebuddy.pollCodebuddyOAuth(state);
    if (res.status === "authorized" && res.accessToken) {
      process.env.CODEBUDDY_API_KEY = res.accessToken;
      // Persist to .env
      try {
        const envPath = path.join(process.cwd(), ".env");
        let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
        if (/^CODEBUDDY_API_KEY=/m.test(content)) {
          content = content.replace(/^CODEBUDDY_API_KEY=.*$/m, `CODEBUDDY_API_KEY=${res.accessToken}`);
        } else {
          content += `\nCODEBUDDY_API_KEY=${res.accessToken}\n`;
        }
        fs.writeFileSync(envPath, content, "utf8");
      } catch {}
    }
    return c.json(res);
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// Re-export as codebuddyRoute for backwards compatibility during migration
export const codebuddyRoute = authRoute;
