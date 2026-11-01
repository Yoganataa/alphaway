import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { adminRequestError } from "../core/admin-guard";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  bootstrapAdmin,
  getAdminAuthStatus,
  loginAdmin,
  readAdminSessionCookie,
  resolveAdminSession,
  revokeAdminSession,
} from "../core/admin-auth";

export const adminAuthRoute = new Hono();

function secureCookie(c: any): boolean {
  try {
    if (new URL(c.req.url).protocol === "https:") return true;
  } catch {}
  return process.env.TRUST_PROXY === "1" &&
    String(c.req.header("x-forwarded-proto") || "").toLowerCase() === "https";
}

function originError(c: any): Response | null {
  const denied = adminRequestError(c);
  return denied ? c.json({ error: denied, code: "admin_origin_rejected" }, 403) : null;
}

adminAuthRoute.get("/api/admin/auth/status", (c) => {
  return c.json(getAdminAuthStatus());
});

adminAuthRoute.get("/api/admin/auth/session", (c) => {
  const identity = resolveAdminSession(readAdminSessionCookie(c));
  return c.json(identity
    ? { authenticated: true, user: { username: identity.username } }
    : { authenticated: false, user: null });
});

adminAuthRoute.post("/api/admin/auth/bootstrap", async (c) => {
  const denied = originError(c);
  if (denied) return denied;
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "A JSON object is required" }, 400);
  }

  try {
    const identity = await bootstrapAdmin({
      bootstrapToken: String(body.bootstrapToken || ""),
      username: String(body.username || ""),
      password: String(body.password || ""),
    });
    if (!identity) {
      return c.json({ error: "Bootstrap token is invalid or an administrator is already configured" }, 403);
    }
    return c.json({ ok: true, user: { username: identity.username } }, 201);
  } catch (error: any) {
    return c.json({ error: error.message || "Administrator setup failed" }, 400);
  }
});

adminAuthRoute.post("/api/admin/auth/login", async (c) => {
  const denied = originError(c);
  if (denied) return denied;
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "A JSON object is required" }, 400);
  }

  const result = await loginAdmin(String(body.username || ""), String(body.password || ""));
  if ("error" in result) {
    if (result.error === "rate_limited") {
      return c.json({ error: "Too many failed attempts. Try again in 15 minutes." }, 429);
    }
    return c.json({ error: "Invalid administrator credentials" }, 401);
  }

  setCookie(c, ADMIN_SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    sameSite: "Strict",
    secure: secureCookie(c),
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return c.json({ ok: true, user: { username: result.identity.username } });
});

adminAuthRoute.post("/api/admin/auth/logout", (c) => {
  const denied = originError(c);
  if (denied) return denied;
  revokeAdminSession(readAdminSessionCookie(c));
  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
