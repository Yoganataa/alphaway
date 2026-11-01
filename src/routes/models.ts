/**
 * Models Route (/v1/models & /api/models)
 */

import { Hono } from "hono";
import { getAllModels } from "../providers";

export const modelsRoute = new Hono();

modelsRoute.get("/v1/models", async (c) => {
  const data = await getAllModels();
  return c.json({ object: "list", data });
});

modelsRoute.get("/api/models", async (c) => {
  const data = await getAllModels();
  return c.json({ object: "list", data });
});
