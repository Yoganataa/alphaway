import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { adminRequest } from "./helpers/admin";
import {
  deletePersonaBinding,
  deletePersonaPreset,
  listPersonaBindings,
  listPersonaGlobalExcludes,
  listPersonaPresets,
  replacePersonaGlobalExcludes,
  resolvePersonaForModels,
  savePersonaPreset,
  setPersonaBinding,
} from "../src/core/persona";
import tokensaver from "../src/features/tokensaver";

async function clearPersonaState() {
  for (const binding of listPersonaBindings()) deletePersonaBinding(binding.modelId);
  for (const preset of listPersonaPresets()) deletePersonaPreset(preset.id);
  replacePersonaGlobalExcludes([]);
}

describe("Persona presets and model resolver", () => {
  beforeEach(async () => {
    await clearPersonaState();
  });

  afterEach(async () => {
    await clearPersonaState();
  });

  it("resolves word-boundary and partial keyword rules", () => {
    savePersonaPreset({
      id: "deepseek",
      name: "DeepSeek Persona",
      prompt: "Use deep analysis.",
      keywords: [{ text: "deepseek" }],
    });

    expect(resolvePersonaForModels(["provider/deepseek-v4"]).injected).toBe(true);
    expect(resolvePersonaForModels(["deepseekia/model"]).reason).toBe("no-match");

    savePersonaPreset({
      id: "coder",
      name: "Coder",
      prompt: "Act as a senior coder.",
      keywords: [{ text: "coder", mode: "partial" }],
    });
    expect(resolvePersonaForModels(["model/my-coder-model"]).presetId).toBe("coder");
  });

  it("applies global exclusions before exact bindings and per-preset exclusions after the winning binding", () => {
    savePersonaPreset({
      id: "reviewer",
      name: "Reviewer",
      prompt: "Review carefully.",
      keywords: [{ text: "model-family" }],
      excludes: [{ text: "internal" }],
    });
    setPersonaBinding({ modelId: "provider/model-family-pro", enabled: true, presetId: "reviewer" });

    expect(resolvePersonaForModels(["provider/model-family-pro"]).reason).toBe("exact-binding");
    expect(resolvePersonaForModels(["provider/model-family-pro-internal"]).reason).toBe("preset-exclude");

    replacePersonaGlobalExcludes([{ text: "model-family-pro", mode: "partial" }]);
    expect(resolvePersonaForModels(["provider/model-family-pro"]).reason).toBe("global-exclude");
  });

  it("keeps exact bindings authoritative over keyword rules and handles empty exact prompts as off", () => {
    savePersonaPreset({ id: "family", name: "Family", prompt: "Family prompt", keywords: [{ text: "model" }] });
    savePersonaPreset({ id: "empty", name: "Empty", prompt: "" });
    setPersonaBinding({ modelId: "provider/model-x", enabled: true, presetId: "empty" });

    const result = resolvePersonaForModels(["provider/model-x"]);
    expect(result.reason).toBe("exact-binding-empty");
    expect(result.injected).toBe(false);
  });

  it("injects the winning model Persona through TokenSaver without enabling global SOUL", () => {
    savePersonaPreset({
      id: "translator",
      name: "Translator",
      prompt: "Translate naturally.",
      keywords: [{ text: "translator" }],
    });
    const result = tokensaver.applyTokenSavers(
      [{ role: "user", content: "Translate this." }],
      {
        ...tokensaver.DEFAULT_CONFIG,
        soulEnabled: false,
        cavemanEnabled: false,
        adhdEnabled: false,
        rtkEnabled: false,
        dlpEnabled: false,
      },
      ["provider/translator-v2"]
    );
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("<agent_persona_specification>");
    expect(result[0].content).toContain("Translate naturally.");
    expect(result[1].role).toBe("user");
  });

  it("runs built-in DLP against generated Persona prompts before upstream dispatch", () => {
    savePersonaPreset({
      id: "credential-check",
      name: "Credential Check",
      prompt: "Example credential: sk-proj-123456789012345678901234567890",
      keywords: [{ text: "credential-test" }],
    });
    const result = tokensaver.applyTokenSavers(
      [{ role: "user", content: "Run this persona." }],
      {
        ...tokensaver.DEFAULT_CONFIG,
        soulEnabled: false,
        cavemanEnabled: false,
        adhdEnabled: false,
        rtkEnabled: false,
        dlpEnabled: true,
        maskSecrets: true,
      },
      ["credential-test"]
    );
    expect(result[0].content).toContain("[REDACTED_API_KEY]");
    expect(result[0].content).not.toContain("sk-proj-123456789012345678901234567890");
  });

  it("serves Persona CRUD, bindings, resolution, and preview behind the administrator session", async () => {
    const create = await adminRequest("/api/persona/presets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset: {
        id: "architect",
        name: "Architect",
        prompt: "Think in systems.",
        keywords: [{ text: "architecture" }],
        excludes: [],
      } }),
    });
    expect(create.status).toBe(200);

    const binding = await adminRequest("/api/persona/models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: "provider/architecture-v1", enabled: true, presetId: "architect" }),
    });
    expect(binding.status).toBe(200);

    const resolve = await adminRequest("/api/persona/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: "provider/architecture-v1" }),
    });
    expect((await resolve.json()).resolution.reason).toBe("exact-binding");

    const preview = await adminRequest("/api/persona/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: "provider/architecture-v1", messages: [{ role: "user", content: "Review" }] }),
    });
    const previewBody = await preview.json();
    expect(previewBody.messages[0].content).toContain("Think in systems.");

    const list = await adminRequest("/api/persona/presets");
    expect((await list.json()).presets.map((p: any) => p.id)).toContain("architect");
  });
});
