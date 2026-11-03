import { Hono } from "hono";
import { adminRequestError, readJsonRequestBody } from "../core/admin-guard";
import {
  listPersonaPresets,
  savePersonaPreset,
  deletePersonaPreset,
  listPersonaBindings,
  setPersonaBinding,
  deletePersonaBinding,
  listPersonaGlobalExcludes,
  replacePersonaGlobalExcludes,
  resolvePersonaForModels,
  formatPersonaPrompt,
} from "../core/persona";

const router = new Hono();

function denied(c: any): Response | null {
  const error = adminRequestError(c);
  return error ? c.json({ ok: false, error }, 403) : null;
}

async function readBody(c: any): Promise<{ body: any; response: Response | null }> {
  try {
    const body = await readJsonRequestBody(c.req);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { body: null, response: c.json({ ok: false, error: "A JSON object is required" }, 400) };
    }
    return { body, response: null };
  } catch (error: any) {
    const status = error?.statusCode === 413 ? 413 : 400;
    return {
      body: null,
      response: c.json({
        ok: false,
        error: status === 413 ? "Request body exceeds the 10 MiB limit" : "Invalid JSON body",
      }, status),
    };
  }
}

router.get("/", (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  return c.json({
    ok: true,
    presets: listPersonaPresets(),
    bindings: listPersonaBindings(),
    excludes: listPersonaGlobalExcludes(),
  });
});

router.get("/presets", (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  return c.json({ presets: listPersonaPresets() });
});

router.put("/presets", async (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  const { body, response } = await readBody(c);
  if (response) return response;
  try {
    const preset = savePersonaPreset(body.preset ?? body);
    return c.json({ ok: true, preset });
  } catch (error: any) {
    return c.json({ ok: false, error: String(error?.message || "Invalid Persona preset") }, 400);
  }
});

router.delete("/presets/:id", (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  try {
    const id = c.req.param("id");
    const deleted = deletePersonaPreset(id);
    return c.json({ ok: true, id, deleted });
  } catch (error: any) {
    return c.json({ ok: false, error: String(error?.message || "Invalid Persona preset ID") }, 400);
  }
});

router.get("/models", (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  return c.json({ bindings: listPersonaBindings() });
});

router.put("/models", async (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  const { body, response } = await readBody(c);
  if (response) return response;
  try {
    const binding = setPersonaBinding(body);
    return c.json({ ok: true, binding });
  } catch (error: any) {
    return c.json({ ok: false, error: String(error?.message || "Invalid Persona binding") }, 400);
  }
});

router.delete("/models", async (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  const { body, response } = await readBody(c);
  if (response) return response;
  try {
    const deleted = deletePersonaBinding(String(body.modelId || ""));
    return c.json({ ok: true, deleted, modelId: body.modelId });
  } catch (error: any) {
    return c.json({ ok: false, error: String(error?.message || "Invalid model ID") }, 400);
  }
});

router.get("/excludes", (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  return c.json({ excludes: listPersonaGlobalExcludes() });
});

router.put("/excludes", async (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  const { body, response } = await readBody(c);
  if (response) return response;
  try {
    const excludes = replacePersonaGlobalExcludes(body.excludes);
    return c.json({ ok: true, excludes });
  } catch (error: any) {
    return c.json({ ok: false, error: String(error?.message || "Invalid global excludes") }, 400);
  }
});

router.post("/resolve", async (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  const { body, response } = await readBody(c);
  if (response) return response;
  const ids = Array.isArray(body.modelIds) ? body.modelIds : [body.modelId];
  try {
    const resolution = resolvePersonaForModels(ids);
    return c.json({ ok: true, resolution });
  } catch (error: any) {
    return c.json({ ok: false, error: String(error?.message || "Persona resolution failed") }, 400);
  }
});

router.post("/preview", async (c) => {
  const blocked = denied(c);
  if (blocked) return blocked;
  const { body, response } = await readBody(c);
  if (response) return response;
  if (!Array.isArray(body.messages) || body.messages.length > 1000) {
    return c.json({ ok: false, error: "Preview messages must be an array with at most 1000 entries" }, 400);
  }
  const ids = Array.isArray(body.modelIds) ? body.modelIds : [body.modelId];
  try {
    const resolution = resolvePersonaForModels(ids);
    const messages = body.messages.slice();
    if (resolution.injected && resolution.prompt) {
      messages.unshift({ role: "system", content: formatPersonaPrompt(resolution.prompt) });
    }
    return c.json({ ok: true, resolution, messages });
  } catch (error: any) {
    return c.json({ ok: false, error: String(error?.message || "Persona preview failed") }, 400);
  }
});

export default router;
