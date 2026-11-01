/**
 * Usage and Analytics REST API Route
 */

import { Hono } from "hono";
import {
  getUsageStats,
  resetUsageStats,
  clearRecentLogs,
  getUsageChart,
  getActivityHeatmap,
  getRequestLogDetail,
} from "../core/usage-tracker";
import { adminRequestError } from "../core/admin-guard";

export const usageRoute = new Hono();

usageRoute.get("/api/usage", (c) => {
  const denied = adminRequestError(c);
  if (denied) {
    return c.json({ error: denied }, 403);
  }
  const stats = getUsageStats();
  return c.json(stats);
});

usageRoute.get("/api/usage/chart", (c) => {
  const denied = adminRequestError(c);
  if (denied) {
    return c.json({ error: denied }, 403);
  }
  const period = c.req.query("period") || "7d";
  const buckets = getUsageChart(period);
  return c.json(buckets);
});

usageRoute.get("/api/usage/heatmap", (c) => {
  const denied = adminRequestError(c);
  if (denied) {
    return c.json({ error: denied }, 403);
  }
  const days = Number(c.req.query("days")) || 84;
  const heatmap = getActivityHeatmap(days);
  return c.json(heatmap);
});

usageRoute.get("/api/usage/details/:id", (c) => {
  const denied = adminRequestError(c);
  if (denied) {
    return c.json({ error: denied }, 403);
  }
  const id = c.req.param("id");
  const detail = getRequestLogDetail(id);
  if (!detail) {
    return c.json({ error: "Request not found" }, 404);
  }
  return c.json(detail);
});

usageRoute.post("/api/usage/reset", (c) => {
  const denied = adminRequestError(c);
  if (denied) {
    return c.json({ error: denied }, 403);
  }
  resetUsageStats();
  return c.json({ ok: true, message: "Usage statistics reset." });
});

usageRoute.post("/api/usage/clear-logs", (c) => {
  const denied = adminRequestError(c);
  if (denied) {
    return c.json({ error: denied }, 403);
  }
  clearRecentLogs();
  return c.json({ ok: true, message: "Recent request logs cleared." });
});
