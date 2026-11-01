"use strict";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import * as soulEngine from "../src/features/soul-engine";
import tokensaver from "../src/features/tokensaver";
import { app } from "../src/app";
import { adminRequest } from "./helpers/admin";

describe("SoulSpec & Personality Engine (soul-engine)", () => {
  const tempSoulPath = path.join(process.cwd(), "SOUL.md");
  let existedBefore = false;
  let originalContent = "";

  beforeEach(() => {
    if (fs.existsSync(tempSoulPath)) {
      existedBefore = true;
      originalContent = fs.readFileSync(tempSoulPath, "utf8");
    } else {
      existedBefore = false;
    }
  });

  afterEach(() => {
    if (existedBefore) {
      fs.writeFileSync(tempSoulPath, originalContent, "utf8");
    } else if (fs.existsSync(tempSoulPath)) {
      try { fs.unlinkSync(tempSoulPath); } catch {}
    }
  });

  it("exports built-in presets conforming to SoulSpec standards", () => {
    expect(soulEngine.ATLAS_SOUL).toContain("# Core Truths");
    expect(soulEngine.ATLAS_SOUL).toContain("Operational reality always beats architectural elegance");
    expect(soulEngine.ATLAS_SOUL).toContain("# Tone & Style");
    expect(soulEngine.ATLAS_SOUL).toContain("# Boundaries");

    expect(soulEngine.MINIMALIST_SOUL).toContain("Write code, not prose");
    expect(soulEngine.SOCRATIC_SOUL).toContain("architectural trade-offs");
  });

  it("formats soul markdown with SoulSpec demarcation tags", () => {
    const formatted = soulEngine.formatSoulPrompt("Be direct.");
    expect(formatted).toContain("<agent_soul_specification>");
    expect(formatted).toContain("# AGENT SOUL PROTOCOL");
    expect(formatted).toContain("Be direct.");
    expect(formatted).toContain("</agent_soul_specification>");
  });

  it("resolves default Atlas preset when no file exists", () => {
    if (fs.existsSync(tempSoulPath)) fs.unlinkSync(tempSoulPath);

    const info = soulEngine.resolveSoulInfo({ soulEnabled: true, soulMode: "preset", soulPreset: "atlas" });
    expect(info.enabled).toBe(true);
    expect(info.preset).toBe("atlas");
    expect(info.content).toBe(soulEngine.ATLAS_SOUL);
    expect(info.tokenEstimate).toBeGreaterThan(50);
  });

  it("auto-discovers local ./SOUL.md file when present", () => {
    const testCustomContent = "# My Custom Project Soul\n- Rule 1: Always use strict types.\n- Rule 2: No fluff.";
    fs.writeFileSync(tempSoulPath, testCustomContent, "utf8");

    const info = soulEngine.resolveSoulInfo({ soulEnabled: true, soulMode: "auto" });
    expect(info.enabled).toBe(true);
    expect(info.source).toBe("workspace");
    expect(info.content).toBe(testCustomContent);
    expect(info.filePath).toBe(tempSoulPath);
  });

  it("injects SOUL.md into system messages via applyTokenSavers", () => {
    const messages = [
      { role: "user", content: "How do I reverse a string in TypeScript?" }
    ];

    const config = {
      ...tokensaver.DEFAULT_CONFIG,
      soulEnabled: true,
      soulMode: "preset" as const,
      soulPreset: "atlas",
    };

    const transformed = tokensaver.applyTokenSavers(messages, config);
    expect(transformed.length).toBe(2);
    expect(transformed[0].role).toBe("system");
    expect(transformed[0].content).toContain("<agent_soul_specification>");
    expect(transformed[0].content).toContain("Operational reality always beats architectural elegance");
    expect(transformed[1].role).toBe("user");
  });

  it("honors soulEnabled=false flag", () => {
    const messages = [
      { role: "user", content: "Hello" }
    ];

    const config = {
      ...tokensaver.DEFAULT_CONFIG,
      soulEnabled: false,
    };

    const transformed = tokensaver.applyTokenSavers(messages, config);
    expect(transformed.length).toBe(1);
    expect(transformed[0].role).toBe("user");
  });
});

describe("SoulSpec REST API Endpoints (/api/soul)", () => {
  it("GET /api/soul returns current configuration and presets", async () => {
    const res = await adminRequest("/api/soul");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.presets).toBeDefined();
    expect(json.presets.atlas).toBeDefined();
    expect(json.presets.minimalist).toBeDefined();
    expect(json.presets.socratic).toBeDefined();
    expect(json.tokenEstimate).toBeGreaterThan(0);
  });

  it("POST /api/soul/preview tests prompt framing and token estimation", async () => {
    const res = await adminRequest("/api/soul/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Check this database migration",
        soulContent: "# Test Soul\n- Act fast.",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.formattedSoul).toContain("<agent_soul_specification>");
    expect(json.formattedSoul).toContain("Act fast.");
    expect(json.enrichedMessages.length).toBe(2);
    expect(json.tokenEstimate).toBeGreaterThan(0);
  });

  it("POST /api/soul updates configuration", async () => {
    const res = await adminRequest("/api/soul", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Host": "127.0.0.1:20129",
      },
      body: JSON.stringify({
        enabled: true,
        mode: "preset",
        preset: "minimalist",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.preset).toBe("minimalist");
    expect(json.content).toContain("Write code, not prose");
  });
});
