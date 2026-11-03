import { getDatabase } from "./database";

export type PersonaKeywordMode = "word" | "partial";

export interface PersonaKeyword {
  text: string;
  mode?: PersonaKeywordMode;
}

export interface PersonaPreset {
  id: string;
  name: string;
  prompt: string;
  kind: string;
  source: string;
  keywords: PersonaKeyword[];
  excludes: PersonaKeyword[];
  order: number;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaModelBinding {
  modelId: string;
  enabled: boolean;
  presetId: string | null;
  updatedAt: string;
}

export interface PersonaResolution {
  injected: boolean;
  reason: "global-exclude" | "exact-binding" | "exact-binding-empty" | "preset-exclude" | "keyword" | "no-match";
  presetId?: string;
  presetName?: string;
  prompt?: string;
  keyword?: string;
  matchedModelId?: string;
  detail: string;
}

interface CompiledKeyword {
  presetId: string;
  text: string;
  mode: PersonaKeywordMode;
}

interface Ruleset {
  presets: Map<string, PersonaPreset>;
  bindings: Map<string, PersonaModelBinding>;
  keywords: CompiledKeyword[];
  globalExcludes: PersonaKeyword[];
}

const MAX_PRESETS = 200;
const MAX_PROMPT_CHARS = 100_000;
const MAX_MODEL_ID_CHARS = 300;
const MAX_KEYWORDS = 20;
const MAX_KEYWORD_CHARS = 200;
const DELIMITERS = "/-_: .";
let cachedRuleset: Ruleset | null = null;

function normalizeKeywords(input: unknown, field: string): PersonaKeyword[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX_KEYWORDS) {
    throw new Error(`${field} must contain at most ${MAX_KEYWORDS} keyword rules`);
  }
  const seen = new Set<string>();
  const result: PersonaKeyword[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${field} entries must be objects`);
    }
    const value = entry as Record<string, unknown>;
    const text = typeof value.text === "string" ? value.text.trim() : "";
    const mode = value.mode === undefined || value.mode === "" ? "word" : value.mode;
    if (!text || text.length > MAX_KEYWORD_CHARS || /[\u0000-\u001f\u007f]/.test(text)) {
      throw new Error(`${field} text must be 1-${MAX_KEYWORD_CHARS} printable characters`);
    }
    if (mode !== "word" && mode !== "partial") {
      throw new Error("Persona keywords support only word and partial matching; regex is intentionally unsupported");
    }
    const normalizedText = mode === "word" || mode === "partial" ? text.toLocaleLowerCase("en-US") : text;
    const key = `${mode}\u0000${normalizedText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ text: normalizedText, mode });
  }
  return result;
}

function validatePreset(input: unknown): Omit<PersonaPreset, "createdAt" | "updatedAt" | "usageCount"> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Persona preset must be an object");
  }
  const value = input as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id.trim().toLowerCase() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const prompt = typeof value.prompt === "string" ? value.prompt : "";
  const kind = typeof value.kind === "string" ? value.kind.trim().toUpperCase().slice(0, 32) : "";
  const source = typeof value.source === "string" ? value.source.trim().slice(0, 500) : "";
  const order = Number.isSafeInteger(value.order) ? Number(value.order) : 0;

  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
    throw new Error("Persona preset ID must be a lowercase slug (letters, numbers, _ or -)");
  }
  if (!name || name.length > 100) throw new Error("Persona preset name must be 1-100 characters");
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`Persona prompt exceeds ${MAX_PROMPT_CHARS} characters`);
  if (order < 0 || order > MAX_PRESETS * 10) throw new Error("Persona preset order is out of range");

  return {
    id,
    name,
    prompt,
    kind,
    source,
    keywords: normalizeKeywords(value.keywords, "keywords"),
    excludes: normalizeKeywords(value.excludes, "excludes"),
    order,
  };
}

function readPresetRows(): PersonaPreset[] {
  const db = getDatabase();
  const presets = db.prepare(`
    SELECT id, name, prompt, kind, source, sort_order, used_count, created_at, updated_at
    FROM persona_presets
    ORDER BY CASE WHEN sort_order = 0 THEN 1 ELSE 0 END, sort_order ASC, id ASC
    LIMIT ?
  `).all(MAX_PRESETS) as any[];
  const keywordQuery = db.prepare(`
    SELECT rule_type, text, mode
    FROM persona_preset_keywords
    WHERE preset_id = ?
    ORDER BY rule_type ASC, sort_order ASC, text ASC
  `);

  return presets.map((row) => {
    const keywords: PersonaKeyword[] = [];
    const excludes: PersonaKeyword[] = [];
    for (const keyword of keywordQuery.all(row.id) as any[]) {
      const value = { text: String(keyword.text), mode: keyword.mode as PersonaKeywordMode };
      if (keyword.rule_type === "include") keywords.push(value);
      else excludes.push(value);
    }
    return {
      id: String(row.id),
      name: String(row.name),
      prompt: String(row.prompt),
      kind: String(row.kind || ""),
      source: String(row.source || ""),
      keywords,
      excludes,
      order: Number(row.sort_order || 0),
      usageCount: Number(row.used_count || 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  });
}

function readBindings(): PersonaModelBinding[] {
  return (getDatabase().prepare(`
    SELECT model_id, enabled, preset_id, updated_at
    FROM persona_model_bindings
    ORDER BY model_id ASC
    LIMIT 10000
  `).all() as any[]).map((row) => ({
    modelId: String(row.model_id),
    enabled: Number(row.enabled) === 1,
    presetId: row.preset_id ? String(row.preset_id) : null,
    updatedAt: String(row.updated_at),
  }));
}

function readGlobalExcludes(): PersonaKeyword[] {
  return (getDatabase().prepare(`
    SELECT text, mode FROM persona_global_excludes
    ORDER BY sort_order ASC, text ASC
    LIMIT 100
  `).all() as any[]).map((row) => ({
    text: String(row.text),
    mode: row.mode as PersonaKeywordMode,
  }));
}

function buildRuleset(): Ruleset {
  const presets = readPresetRows();
  const presetMap = new Map(presets.map((preset) => [preset.id, preset]));
  const bindings = new Map(readBindings().map((binding) => [binding.modelId, binding]));
  const keywords: CompiledKeyword[] = [];
  for (const preset of presets.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    if (!preset.prompt) continue;
    for (const keyword of preset.keywords) {
      keywords.push({ presetId: preset.id, text: keyword.text, mode: keyword.mode || "word" });
    }
  }
  return { presets: presetMap, bindings, keywords, globalExcludes: readGlobalExcludes() };
}

function ruleset(): Ruleset {
  if (!cachedRuleset) cachedRuleset = buildRuleset();
  return cachedRuleset;
}

function invalidateRuleset(): void {
  cachedRuleset = null;
}

function matches(id: string, rule: PersonaKeyword): boolean {
  if (!id || !rule.text) return false;
  const modelId = id.toLocaleLowerCase("en-US");
  const keyword = rule.text.toLocaleLowerCase("en-US");
  if ((rule.mode || "word") === "partial") return modelId.includes(keyword);

  let from = 0;
  while (from <= modelId.length - keyword.length) {
    const index = modelId.indexOf(keyword, from);
    if (index < 0) return false;
    const end = index + keyword.length;
    const leftBoundary = index === 0 || DELIMITERS.includes(modelId[index - 1]);
    const rightBoundary = end === modelId.length || DELIMITERS.includes(modelId[end]);
    if (leftBoundary && rightBoundary) return true;
    from = index + 1;
  }
  return false;
}

function matchesAny(ids: string[], rules: PersonaKeyword[]): { id: string; rule: PersonaKeyword } | null {
  for (const id of ids) {
    for (const rule of rules) {
      if (matches(id, rule)) return { id, rule };
    }
  }
  return null;
}

export function listPersonaPresets(): PersonaPreset[] {
  return readPresetRows();
}

export function getPersonaPreset(id: string): PersonaPreset | null {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) return null;
  return readPresetRows().find((preset) => preset.id === id) ?? null;
}

export function savePersonaPreset(input: unknown): PersonaPreset {
  const preset = validatePreset(input);
  const db = getDatabase();
  const existing = db.prepare("SELECT created_at FROM persona_presets WHERE id = ?").get(preset.id) as { created_at: string } | undefined;
  if (!existing) {
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM persona_presets").get()?.count || 0);
    if (count >= MAX_PRESETS) throw new Error(`Persona library is limited to ${MAX_PRESETS} presets`);
  }
  const now = new Date().toISOString();
  const createdAt = existing?.created_at || now;

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO persona_presets (id, name, prompt, kind, source, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        prompt = excluded.prompt,
        kind = excluded.kind,
        source = excluded.source,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `).run(preset.id, preset.name, preset.prompt, preset.kind, preset.source, preset.order, createdAt, now);

    db.prepare("DELETE FROM persona_preset_keywords WHERE preset_id = ?").run(preset.id);
    const insert = db.prepare(`
      INSERT INTO persona_preset_keywords (preset_id, rule_type, text, mode, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    preset.keywords.forEach((keyword, index) => insert.run(preset.id, "include", keyword.text, keyword.mode || "word", index));
    preset.excludes.forEach((keyword, index) => insert.run(preset.id, "exclude", keyword.text, keyword.mode || "word", index));
  });
  transaction();
  invalidateRuleset();
  return getPersonaPreset(preset.id)!;
}

export function deletePersonaPreset(id: string): boolean {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw new Error("Invalid Persona preset ID");
  const result = getDatabase().prepare("DELETE FROM persona_presets WHERE id = ?").run(id);
  invalidateRuleset();
  return Number(result.changes) > 0;
}

export function listPersonaBindings(): PersonaModelBinding[] {
  return readBindings();
}

export function setPersonaBinding(input: unknown): PersonaModelBinding {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Persona binding must be an object");
  const value = input as Record<string, unknown>;
  const modelId = typeof value.modelId === "string" ? value.modelId.trim() : "";
  const enabled = value.enabled;
  const presetId = typeof value.presetId === "string" ? value.presetId.trim().toLowerCase() : "";

  if (!modelId || modelId.length > MAX_MODEL_ID_CHARS || /[\u0000-\u001f\u007f]/.test(modelId)) {
    throw new Error(`Model ID must be 1-${MAX_MODEL_ID_CHARS} printable characters`);
  }
  if (typeof enabled !== "boolean") throw new Error("Persona binding enabled must be a boolean");
  if (enabled && !presetId) throw new Error("An enabled Persona binding requires a preset ID");
  if (presetId && !getPersonaPreset(presetId)) throw new Error("Persona preset does not exist");

  const now = new Date().toISOString();
  getDatabase().prepare(`
    INSERT INTO persona_model_bindings (model_id, enabled, preset_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(model_id) DO UPDATE SET
      enabled = excluded.enabled,
      preset_id = excluded.preset_id,
      updated_at = excluded.updated_at
  `).run(modelId, enabled ? 1 : 0, presetId || null, now);
  invalidateRuleset();
  return { modelId, enabled, presetId: presetId || null, updatedAt: now };
}

export function deletePersonaBinding(modelId: string): boolean {
  const id = modelId.trim();
  if (!id || id.length > MAX_MODEL_ID_CHARS) throw new Error("Invalid model ID");
  const result = getDatabase().prepare("DELETE FROM persona_model_bindings WHERE model_id = ?").run(id);
  invalidateRuleset();
  return Number(result.changes) > 0;
}

export function listPersonaGlobalExcludes(): PersonaKeyword[] {
  return readGlobalExcludes();
}

export function replacePersonaGlobalExcludes(input: unknown): PersonaKeyword[] {
  const excludes = normalizeKeywords(input, "global excludes");
  const db = getDatabase();
  const transaction = db.transaction(() => {
    db.exec("DELETE FROM persona_global_excludes");
    const insert = db.prepare("INSERT INTO persona_global_excludes (text, mode, sort_order) VALUES (?, ?, ?)");
    excludes.forEach((rule, index) => insert.run(rule.text, rule.mode || "word", index));
  });
  transaction();
  invalidateRuleset();
  return excludes;
}

function normalizedCandidateIds(candidateIds: readonly string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidateIds.slice(0, 8)) {
    if (typeof candidate !== "string") continue;
    const id = candidate.trim();
    if (!id || id.length > MAX_MODEL_ID_CHARS || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Resolve the same immutable rule snapshot used by request-time injection. */
export function resolvePersonaForModels(candidateModelIds: readonly string[]): PersonaResolution {
  const ids = normalizedCandidateIds(candidateModelIds);
  const current = ruleset();

  const globalExclude = matchesAny(ids, current.globalExcludes);
  if (globalExclude) {
    return {
      injected: false,
      reason: "global-exclude",
      keyword: globalExclude.rule.text,
      matchedModelId: globalExclude.id,
      detail: "A global exclude rule disables Persona injection for this model.",
    };
  }

  for (const id of ids) {
    const binding = current.bindings.get(id);
    if (!binding?.enabled || !binding.presetId) continue;
    const preset = current.presets.get(binding.presetId);
    if (!preset) continue;
    const excluded = matchesAny(ids, preset.excludes);
    if (excluded) {
      return {
        injected: false,
        reason: "preset-exclude",
        presetId: preset.id,
        presetName: preset.name,
        keyword: excluded.rule.text,
        matchedModelId: excluded.id,
        detail: "The exact binding matched, but this preset excludes one of the candidate model IDs.",
      };
    }
    if (!preset.prompt) {
      return {
        injected: false,
        reason: "exact-binding-empty",
        presetId: preset.id,
        presetName: preset.name,
        matchedModelId: id,
        detail: "An exact binding is authoritative, but its preset has an empty prompt.",
      };
    }
    return {
      injected: true,
      reason: "exact-binding",
      presetId: preset.id,
      presetName: preset.name,
      prompt: preset.prompt,
      matchedModelId: id,
      detail: "An exact model binding takes precedence over keyword rules.",
    };
  }

  let best: { rule: CompiledKeyword; modelId: string } | null = null;
  for (const id of ids) {
    const matchesForId = current.keywords.filter((rule) => matches(id, { text: rule.text, mode: rule.mode }));
    if (matchesForId.length > 0) {
      matchesForId.sort((a, b) => b.text.length - a.text.length || a.presetId.localeCompare(b.presetId));
      best = { rule: matchesForId[0], modelId: id };
      break;
    }
  }

  if (!best) {
    return { injected: false, reason: "no-match", detail: "No exact binding or Persona keyword matched this model." };
  }

  const preset = current.presets.get(best.rule.presetId);
  if (!preset) return { injected: false, reason: "no-match", detail: "The matching Persona preset no longer exists." };

  const excluded = matchesAny(ids, preset.excludes);
  if (excluded) {
    return {
      injected: false,
      reason: "preset-exclude",
      presetId: preset.id,
      presetName: preset.name,
      keyword: excluded.rule.text,
      matchedModelId: excluded.id,
      detail: "The keyword matched, but this preset excludes one of the candidate model IDs.",
    };
  }

  return {
    injected: true,
    reason: "keyword",
    presetId: preset.id,
    presetName: preset.name,
    prompt: preset.prompt,
    keyword: best.rule.text,
    matchedModelId: best.modelId,
    detail: "A Persona keyword matched this model ID.",
  };
}

export function recordPersonaUsage(presetId: string): void {
  if (!presetId) return;
  getDatabase().prepare("UPDATE persona_presets SET used_count = used_count + 1 WHERE id = ?")
    .run(presetId);
}

export function formatPersonaPrompt(prompt: string): string {
  const content = prompt.trim();
  if (!content) return "";
  return `<agent_persona_specification>\n# MODEL PERSONA\n${content}\n</agent_persona_specification>`;
}
