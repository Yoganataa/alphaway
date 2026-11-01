/**
 * Authentication & OAuth Route (/api/auth/* and /api/codebuddy/oauth/*)
 * Handles Provider OAuth Device Flow (CodeBuddy, etc.)
 */

import { Hono } from "hono";
import { setCodeBuddyApiKey } from "../core/codebuddy-credentials";
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
    if (res.status === "pending") return c.json({ status: "pending" });
    if (res.status === "authorized" && res.accessToken) {
      setCodeBuddyApiKey(res.accessToken);
      process.env.CODEBUDDY_API_KEY = res.accessToken;
      // Access and refresh tokens remain server-side and are never returned to the browser.
      return c.json({ status: "success", message: "CodeBuddy credential saved securely." });
    }
    return c.json({
      status: "error",
      message: res.message || "CodeBuddy authorization failed.",
    });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// Re-export as codebuddyRoute for backwards compatibility during migration
export const codebuddyRoute = authRoute;
