"use strict";

import { Hono } from "hono";
import tokensaver from "../features/tokensaver";
import * as soulEngine from "../features/soul-engine";
import { adminRequestError, readJsonRequestBody } from "../core/admin-guard";

const router = new Hono();

// GET /api/soul - Retrieve current Soul status, resolved source, and presets
router.get("/", (c) => {
  const config = tokensaver.getConfig();
  const info = soulEngine.resolveSoulInfo(config);

  return c.json({
    ok: true,
    enabled: config.soulEnabled !== false,
    mode: config.soulMode || "auto",
    preset: info.preset,
    source: info.source,
    filePath: info.filePath,
    content: info.content,
    tokenEstimate: info.tokenEstimate,
    presets: {
      atlas: soulEngine.ATLAS_SOUL,
      minimalist: soulEngine.MINIMALIST_SOUL,
      socratic: soulEngine.SOCRATIC_SOUL,
    },
  });
});

// POST /api/soul - Update Soul configuration or save to file
router.post("/", async (c) => {
  const denied = adminRequestError(c);
  if (denied) return c.json({ ok: false, error: denied }, 403);

  let body: any = {};
  try {
    body = await readJsonRequestBody(c.req);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("Invalid JSON body"), { statusCode: 400 });
  } catch (err: any) {
    const status = err?.statusCode === 413 ? 413 : 400;
    return c.json({ ok: false, error: status === 413 ? "Request body exceeds the 10 MiB limit" : "Invalid JSON body" }, status);
  }

  const updates: any = {};

  if (typeof body.enabled === "boolean") {
    updates.soulEnabled = body.enabled;
  }
  if (body.mode && ["auto", "preset", "custom"].includes(body.mode)) {
    updates.soulMode = body.mode;
  }
  if (body.preset && ["atlas", "minimalist", "socratic", "custom"].includes(body.preset)) {
    updates.soulPreset = body.preset;
  }
  if (typeof body.filePath === "string") {
    updates.soulFilePath = body.filePath.trim();
  }
  if (typeof body.customContent === "string") {
    updates.soulCustomContent = body.customContent;
  }

  // Handle saving directly to disk if requested
  if (body.saveToFile && body.targetPath && typeof body.content === "string") {
    const saveRes = soulEngine.saveSoulFile(body.targetPath, body.content);
    if (!saveRes.ok) {
      return c.json({ ok: false, error: `Failed to save file: ${saveRes.error}` }, 500);
    }
  }

  const newConfig = tokensaver.saveConfig(updates);
  const info = soulEngine.resolveSoulInfo(newConfig);

  return c.json({
    ok: true,
    message: "Soul configuration saved successfully",
    enabled: newConfig.soulEnabled !== false,
    mode: newConfig.soulMode || "auto",
    preset: info.preset,
    source: info.source,
    filePath: info.filePath,
    content: info.content,
    tokenEstimate: info.tokenEstimate,
  });
});

// POST /api/soul/preview - Test a prompt against the formatted Soul persona
router.post("/preview", async (c) => {
  let body: any = {};
  try {
    body = await readJsonRequestBody(c.req);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("Invalid JSON body"), { statusCode: 400 });
  } catch (err: any) {
    const status = err?.statusCode === 413 ? 413 : 400;
    return c.json({ ok: false, error: status === 413 ? "Request body exceeds the 10 MiB limit" : "Invalid JSON body" }, status);
  }

  const prompt = body.prompt || "How do I optimize database connections?";
  const content = body.soulContent || soulEngine.ATLAS_SOUL;
  const formatted = soulEngine.formatSoulPrompt(content);

  const simulatedMessages = [
    { role: "user", content: prompt },
  ];

  const config = {
    ...tokensaver.getConfig(),
    soulEnabled: true,
    soulMode: "custom" as const,
    soulCustomContent: content,
  };

  const enriched = tokensaver.applyTokenSavers(simulatedMessages, config);

  return c.json({
    ok: true,
    prompt,
    formattedSoul: formatted,
    enrichedMessages: enriched,
    tokenEstimate: soulEngine.estimateTokens(formatted) + soulEngine.estimateTokens(prompt),
  });
});

export default router;
