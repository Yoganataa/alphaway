/**
 * OpenCode Free-Tier Provider Engine (TypeScript)
 * Implements dual-lane routing (/inference/v1/chat/completions vs /v1/responses),
 * gate anchors, AST Effect tool schemas, session LRU caching, and adaptive retries.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  GateShapeAudit,
  ModelInfo,
} from "../types";

const identity = require("../core/identity");
export { identity };
import { effectiveMaxTokens } from "../core/token-budget";
import * as proxy from "../core/proxy";
import * as tokensaver from "../features/tokensaver";
import * as codebuddy from "./codebuddy";

export interface OpenCodePayloadResult {
  upstreamBody: any;
  aliasToOriginal: Map<string, string>;
  originalToAlias?: Map<string, string>;
  tools?: any[];
  appended?: string[];
  placeholderNote?: string;
}

export const DEFAULT_OPENCODE_MODELS = [
  "mimo-v2.6-flash-free",
  "big-pickle",
  "minimax-m2.5-free",
  "kimi-k2.5-free",
  "deepseek-v3.1-free",
  "qwen-2.5-coder-free",
];

export const OPENCODE_PREFIXES = ["opencode/", "oc/", "free/"];

export const OPENCODE_RESPONSES_URL =
  process.env.OPENCODE_RESPONSES_URL || "https://opencode.ai/inference/v1/responses";
export const OPENCODE_CHAT_URL =
  process.env.OPENCODE_CHAT_URL || "https://opencode.ai/inference/v1/chat/completions";
export const OPENCODE_MODELS_URL =
  process.env.OPENCODE_MODELS_URL || "https://opencode.ai/inference/v1/models";

export const OPENCODE_HARNESS_SYSTEM = `You are an AI agent running in OpenCode, a coding agent harness. Help the user accomplish their goals using the tools you have available.

# Harness
- Responses are rendered as GitHub-flavored Markdown.
- \`<system-reminder>\` blocks are harness instructions, not user-authored content. Read and follow them.
- Prefer parallelizing independent tool calls.
- Prefer dedicated tools over shell commands; fall back to the shell when a tool cannot do what you need.
- Do not chain shell commands with separators like \`echo "====";\` or \`printf '---'\`; the output becomes noisy in a way that makes the user's side of the conversation worse.
- Use the write tool to create files or completely replace their content. Prefer using the edit tool for targeted changes.
- Use the edit tool for targeted changes to existing text files. It replaces the exact text in \`oldString\` with \`newString\`, and the values must differ. By default, \`oldString\` must occur exactly once. If it occurs multiple times, include more surrounding context to make it unique or set \`replaceAll\` to true to replace every occurrence.

# Communication
- Use clear file paths when referring to files.
- Keep responses clear and concise, and avoid unnecessary technical jargon.

# Working in codebases
- Keep changes consistent with the structure, naming, style, and patterns of the surrounding code.
- Treat unfamiliar files or changes as potential user work and investigate before deleting or overwriting them.

# Your Model
- Name: GLM-5.3-Flash Free
- Provider ID: opencode
- Model ID: glm-5.3-flash-free
# Code Mode

Use the \`execute\` tool to call the tools listed below. They cannot be called directly. They only work inside code you pass to \`execute\`.

The catalog is complete. Do not guess tool names.

## Available tools

- opencode (8 tools) // Tools for managing OpenCode itself, such as working with sessions and worktrees, searching the available models, and reading MCP resources.
  - tools.opencode.list_mcp_resources({
  /** MCP server name as configured. Omit to list every server. */
  server?: string,
}): Promise<{
  resources: Array<{
      server: string,
      name: string,
      uri: string,
      description?: string,
      mimeType?: string,
    }>,
  templates: Array<{
      server: string,
      name: string,
      uriTemplate: string,
      description?: string,
      mimeType?: string,
    }>,
}> // List documents, records, and other data exposed by MCP servers. Use this when the user refers to something that is not in the repository.
  - tools.opencode.models({
  /** Text to search for in model names and IDs. */
  query?: string,
  /** Provider ID or name to filter by. Try your own provider first. */
  provider?: string,
  /** Include older versions of each model family. By default only the newest version is listed. */
  all?: boolean,
  /** Maximum number of models to return. Defaults to 20. @integer @minimum 1 @maximum 100 */
  limit?: number,
  /** Number of models to skip, for paging through results. @integer @minimum 0 */
  offset?: number,
}): Promise<{
  /** Matching models grouped by provider. Your own provider comes first. */
  providers: Array<{
      id: string,
      name: string,
      /** Newest first. */
      models: Array<{
          /** providerID/modelID */
          id: string,
          name: string,
          /** Release date as a Unix timestamp in milliseconds, or 0 when unknown. */
          released: number,
          variants: Array<string>,
          /** Pricing in USD per million tokens. */
          cost: Array<{
              tier?: {
                type: "context",
                /** @integer */
                size: number,
              },
              input: number,
              output: number,
              cache: {
                read: number,
                write: number,
              },
            }>,
          status: "alpha" | "beta" | "deprecated" | "active",
        }>,
    }>,
  /** Number of matching models across all pages. @integer */
  total: number,
  /** Offset of the next page, or null on the last page. */
  next: number | null,
}> // Search the models available to use. Use this to turn a model name the user mentions into an exact reference before running a command with it.
  - tools.opencode.read_mcp_resource({
  /** The server field of the discovered resource. */
  server: string,
  /** Exact resource URI from discovery, an expanded uriTemplate, or the user. */
  uri: string,
}): Promise<{
  server: string,
  uri: string,
  contents: Array<{
        type: "text",
        uri: string,
        text: string,
        mimeType?: string,
      } | {
        type: "blob",
        uri: string,
        blob: string,
        mimeType?: string,
      }>,
}> // Read one MCP resource by server and URI. Not for local files. Always return the full contents rather than slicing or excerpting.
  - tools.opencode.session_move({
  /** Omit to move the current session. @pattern ^ses */
  sessionID?: string,
  /** Destination directory, relative to the target session's directory or absolute. Supports ~. @minLength 1 */
  directory: string,
}): Promise<{
  /** @pattern ^ses */
  sessionID: string,
  directory: string,
}> // Move a session to another directory, or omit sessionID to move the current session. The current session moves at the end of the turn.
  - tools.opencode.session_rename({
  /** Omit to rename the current session. @pattern ^ses */
  sessionID?: string,
  /** New session title. @minLength 1 */
  title: string,
}): Promise<{
  /** @pattern ^ses */
  sessionID: string,
  title: string,
}> // Rename a session, or omit sessionID to rename the current session. Use a short, specific title that summarizes the work done.
  - tools.opencode.worktree_create({
  name: string,
}): Promise<{
  directory: string,
}> // Create a named worktree. Returns its directory.
  - tools.opencode.worktree_list(): Promise<{
  worktrees: Array<{
      directory: string,
      strategy?: string,
    }>,
}> // List a repository's worktrees.
  - tools.opencode.worktree_remove({
  /** Absolute path of the worktree to remove. @minLength 1 */
  directory: string,
  /** Discard modified and untracked files. Only set this when the user has confirmed forced removal. */
  force?: boolean,
}): Promise<{
  directory: string,
  removed: boolean,
}> // Remove a worktree. The repository location selects configuration; directory identifies the worktree to remove.

Skills provide specialized instructions and workflows for specific tasks.
Use the skill tool to load a skill when a task matches its description.
The user may also invoke a skill directly. When that happens, its instructions appear in the conversation as a <skill_content> block, the same shape the skill tool returns. A skill that is already present this way does not need to be invoked again.
<available_skills>
  <skill>
    <id>opencode</id>
    <name>OpenCode</name>
    <description>Use this skill for any question about OpenCode itself, including how OpenCode works, using or configuring it, migrating from V1 to V2, troubleshooting it, developing plugins or integrations, using the OpenCode SDK, clients, server, or API, and contributing to the OpenCode codebase. Also use it for OpenCode agents, commands, skills, tools, permissions, MCP servers, providers, models, themes, keybinds, formatters, the CLI, TUI, desktop app, and web app.</description>
  </skill>
  <skill>
    <id>report</id>
    <name>Report</name>
    <description>Use when the user wants to report an opencode issue or bug. Collect standard diagnostics, add user-specific reproduction context, and publish the issue with GitHub CLI.</description>
  </skill>
</available_skills>

Today's date: Sun Oct 25 2026

Here is some useful information about the environment you are running in:
<env>
  Working directory: /tmp/ocprobe
  Workspace root folder: /tmp/ocprobe
  Is directory a git repo: no
  Platform: linux
  Prefer /tmp/opencode over generic system temporary directories such as /tmp; it is pre-created and approved for external access.
</env>
When you create a worktree outside the current working directory and intend to use it as your primary working directory, consider using \`execute\` to call \`tools.opencode.session_move\` and make the worktree the session's working directory.`;

export const OPENCODE_BUILTIN_PLACEHOLDER_NOTE =
  "The Code Mode instructions above do not apply to this session, and the built-in OpenCode tools declared in this request are non-functional placeholders. Never call them and never wrap tool usage in execute or in code. No tools are available; answer directly.";

export const OPENCODE_SESSION_TOOL_PROTOCOL_NOTE =
  "# Session tool protocol\n" +
  "The Code Mode and tool-catalog instructions above do NOT apply to this session, and the built-in OpenCode tools (edit, glob, grep, question, read, shell, skill, subagent, webfetch, websearch, write, execute) declared in this request are non-functional placeholders — never call them directly.\n" +
  "The calling client provides the tools listed below. To invoke one, emit a tool_call to the execute tool whose code argument is exactly: CALL_TOOL <tool-name> <json-arguments> — for example {\"code\":\"CALL_TOOL get_weather {\\\"city\\\":\\\"Jakarta\\\"}\"}. The harness routes it to that caller tool and returns its result as the tool result. This execute/CALL_TOOL form is the only working way to call the tools below. When a request needs one of them, emit the CALL_TOOL call immediately instead of narrating or writing code.";

// --- Protocol Lane Routing ---
const responsesModelSet = new Set<string>(
  (process.env.RESPONSES_MODELS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
const chatModelSet = new Set<string>();

export function isResponsesModel(modelId: string | null | undefined): boolean {
  const lower = String(modelId || "").trim().toLowerCase();
  if (!lower) return false;
  if (chatModelSet.has(lower)) return false;
  if (responsesModelSet.has(lower)) return true;
  return false;
}

export function markProtocolSupport(modelId: string, useResponses: boolean): void {
  const lower = String(modelId || "").trim().toLowerCase();
  if (!lower) return;
  if (useResponses) {
    responsesModelSet.add(lower);
    chatModelSet.delete(lower);
  } else {
    chatModelSet.add(lower);
    responsesModelSet.delete(lower);
  }
}

export function resetProtocolLanes(): void {
  chatModelSet.clear();
  responsesModelSet.clear();
  for (const m of (process.env.RESPONSES_MODELS || "").split(",")) {
    const id = m.trim().toLowerCase();
    if (id) responsesModelSet.add(id);
  }
}
export const __resetProtocolLanes = resetProtocolLanes;

// --- Canonical Tools & Fingerprinting ---
export function getCanonicalTools(flat: boolean, scope: string | null = null, modelId: string | null = null): any[] {
  return identity.getToolList(flat, scope, modelId);
}

export const CANONICAL_TOOLS_CHAT = new Proxy([] as any[], {
  get(target, prop, receiver) {
    const tools = getCanonicalTools(false);
    return Reflect.get(tools, prop, receiver);
  },
});

export const CANONICAL_TOOLS_RESPONSES = new Proxy([] as any[], {
  get(target, prop, receiver) {
    const tools = getCanonicalTools(true);
    return Reflect.get(tools, prop, receiver);
  },
});

function stableStringify(val: any): string {
  if (!val || typeof val !== "object") return JSON.stringify(val);
  if (Array.isArray(val)) return "[" + val.map(stableStringify).join(",") + "]";
  const keys = Object.keys(val).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(val[k])).join(",") + "}";
}

const EMPTY_MAP = Object.freeze(new Map<string, string>());
const paramSigCache = new WeakMap<object, string>();
function getParamSig(params: any): string {
  if (!params || typeof params !== "object") return stableStringify(params);
  let sig = paramSigCache.get(params);
  if (sig === undefined) {
    sig = stableStringify(params);
    paramSigCache.set(params, sig);
  }
  return sig;
}

export function getFingerprintNames(scope: string | null = null, modelId: string | null = null): string[] {
  return identity.getToolList(false, scope, modelId).map((t: any) => t.function.name);
}

export function getFingerprintDefinitions(): any {
  return identity.getTools();
}

export function getToolName(tool: any): string {
  if (!tool || typeof tool !== "object") return "";
  if (typeof tool.name === "string") return tool.name.trim();
  if (tool.function && typeof tool.function.name === "string") return tool.function.name.trim();
  return "";
}

export function isExactFingerprintDef(tool: any, key: string): boolean {
  const want = (identity.getTools() as any)[key];
  if (!want || !tool || typeof tool !== "object") return false;
  const def = tool.function && typeof tool.function === "object" ? tool.function : tool;
  return (
    def.description === want.description &&
    getParamSig(def.parameters) === getParamSig(want.parameters)
  );
}

export function buildPlaceholderNote(appendedNames: string[]): string {
  if (!Array.isArray(appendedNames) || appendedNames.length === 0) return "";
  const list = appendedNames.map((n) => `\`${n}\``).join(" or ");
  return appendedNames.length > 1
    ? `Do not call the ${list} tools; they are placeholders that do nothing. Use the other tools you have been given instead.`
    : `Do not call the ${list} tool; it is a placeholder that does nothing. Use the other tools you have been given instead.`;
}

export function prepareToolsWithFingerprint(
  clientTools: any[] = [],
  flat = false,
  scope: string | null = null,
  modelId: string | null = null
): {
  tools: any[];
  appended: string[];
  placeholderNote: string;
  aliasToOriginal: Map<string, string>;
  originalToAlias: Map<string, string>;
} {
  const fingerprintNames = getFingerprintNames(scope, modelId);
  const canonical = getCanonicalTools(flat, scope, modelId);
  const canonicalByName = new Map(
    canonical.map((t: any) => [flat ? t.name : t.function.name, t])
  );

  if (!Array.isArray(clientTools) || clientTools.length === 0) {
    return {
      tools: canonical,
      appended: fingerprintNames,
      placeholderNote: buildPlaceholderNote(fingerprintNames),
      aliasToOriginal: EMPTY_MAP,
      originalToAlias: EMPTY_MAP,
    };
  }

  const aliasToOriginal = new Map<string, string>();
  const originalToAlias = new Map<string, string>();
  const normalized: any[] = [];
  const takenNames = new Set(clientTools.map(getToolName).filter(Boolean));
  const presentExactFingerprints = new Set<string>();

  for (const t of clientTools) {
    const name = getToolName(t);
    if (!name) continue;
    const def = t.function && typeof t.function === "object" ? t.function : t;
    const description = def.description || "";
    const parameters = def.parameters || { type: "object", properties: {} };

    if (fingerprintNames.includes(name)) {
      if (presentExactFingerprints.has(name)) continue;
      if (isExactFingerprintDef(t, name)) {
        presentExactFingerprints.add(name);
        normalized.push(
          flat
            ? { type: "function", name, description, parameters, strict: false }
            : { type: "function", function: { name, description, parameters } }
        );
        continue;
      }
      if (originalToAlias.has(name)) continue;
      let alias = `${name}_client`;
      for (let i = 2; takenNames.has(alias); i++) {
        alias = `${name}_client${i}`;
      }
      takenNames.add(alias);
      aliasToOriginal.set(alias, name);
      originalToAlias.set(name, alias);
      normalized.push(
        flat
          ? { type: "function", name: alias, description, parameters }
          : { type: "function", function: { name: alias, description, parameters } }
      );
      continue;
    }

    normalized.push(
      flat
        ? { type: "function", name, description, parameters }
        : { type: "function", function: { name, description, parameters } }
    );
  }

  const appended: string[] = [];
  for (const name of fingerprintNames) {
    if (presentExactFingerprints.has(name)) continue;
    const def = canonicalByName.get(name);
    if (!def) continue;
    normalized.push(def);
    appended.push(name);
  }

  return {
    tools: normalized,
    appended,
    placeholderNote:
      appended.length === fingerprintNames.length
        ? buildPlaceholderNote(fingerprintNames)
        : buildPlaceholderNote(appended),
    aliasToOriginal,
    originalToAlias,
  };
}

export function prepareResponsesTools(clientTools: any[] = [], modelId: string | null = null): any[] {
  return prepareToolsWithFingerprint(clientTools, true, null, modelId).tools;
}

export function prepareChatTools(clientTools: any[] = [], modelId: string | null = null): any[] {
  return prepareToolsWithFingerprint(clientTools, false, null, modelId).tools;
}

export function restoreClientToolName(name: string, aliasToOriginal: Map<string, string>): string {
  if (!name || !aliasToOriginal || aliasToOriginal.size === 0) return name;
  return aliasToOriginal.get(name) || name;
}

export function extractContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        if (p?.type === "text" && typeof p.text === "string") return p.text;
        if (p?.text) return String(p.text);
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return content ? JSON.stringify(content) : "";
}

export function shortText(content: any, limit = 1000): string {
  if (typeof content === "string") return content.slice(0, limit);
  if (Array.isArray(content)) {
    let out = "";
    for (const p of content) {
      if (out.length >= limit) break;
      if (typeof p === "string") out += p;
      else if (p?.type === "text" && typeof p.text === "string") out += p.text;
      else if (p?.text) out += String(p.text);
    }
    return out.slice(0, limit);
  }
  if (!content) return "";
  try {
    return JSON.stringify(content).slice(0, limit);
  } catch {
    return "";
  }
}

export function messageSignatureSample(content: any, limit = 1000): string {
  if (typeof content === "string") {
    const len = content.length;
    if (len <= limit) return `${len}:${content}`;
    const half = Math.floor(limit / 2);
    return `${len}:${content.slice(0, half)}..${content.slice(len - half)}`;
  }
  if (Array.isArray(content)) {
    const head = shortText(content, Math.floor(limit / 2));
    const last = content[content.length - 1];
    const tail = shortText(last ? [last] : [], Math.floor(limit / 2));
    return `${content.length}:${head}..${tail}`;
  }
  return shortText(content, limit);
}

let harnessEnvBlockCache = { cwd: "", block: "" };
export function buildHarnessEnvBlock(): string {
  const cwd = process.cwd();
  if (harnessEnvBlockCache.cwd === cwd && harnessEnvBlockCache.block) {
    return harnessEnvBlockCache.block;
  }
  let isRepo = "no";
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    });
    isRepo = "yes";
  } catch {}
  const block = [
    "Here is some useful information about the environment you are running in:",
    "<env>",
    `  Working directory: ${cwd}`,
    `  Workspace root folder: ${cwd}`,
    `  Is directory a git repo: ${isRepo}`,
    "  Platform: " + process.platform,
    "</env>",
  ].join("\n");
  harnessEnvBlockCache = { cwd, block };
  return block;
}

export function withHarnessEnvBlock(systemText: string, placeholderNote = "", scope: string | null = null): string {
  const text = typeof systemText === "string" ? systemText : "";
  const hasHarness = text.includes("You are an AI agent running in OpenCode");
  const hasEnv = /<env>[\s\S]*?Working directory:/.test(text);

  if (scope === "core") {
    if (hasEnv) return text;
    const block = buildHarnessEnvBlock();
    return text.trim() ? `${text.replace(/\s+$/, "")}\n\n${block}` : block;
  }

  let out = "";
  if (hasHarness) {
    out = text;
  } else {
    out = OPENCODE_HARNESS_SYSTEM;
    if (text.trim()) {
      out += `\n\n${text.trim()}`;
    }
  }

  if (placeholderNote && !out.includes(placeholderNote)) {
    out += `\n\n${placeholderNote}`;
  } else if (!hasHarness && !placeholderNote && !out.includes(OPENCODE_BUILTIN_PLACEHOLDER_NOTE)) {
    out += `\n\n${OPENCODE_BUILTIN_PLACEHOLDER_NOTE}`;
  }

  if (!hasEnv && !/<env>[\s\S]*?Working directory:/.test(out)) {
    out += `\n\n${buildHarnessEnvBlock()}`;
  }
  return out;
}

export function extractSystemInstructions(
  messages: any[] = [],
  explicitInstructions = "",
  placeholderNote = "",
  scope: string | null = null
): string {
  const parts: string[] = [];
  if (typeof explicitInstructions === "string" && explicitInstructions.trim()) {
    parts.push(explicitInstructions.trim());
  }
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || (m.role !== "system" && m.role !== "developer")) continue;
    const text = extractContent(m.content).trim();
    if (text) parts.push(text);
  }
  return withHarnessEnvBlock(parts.join("\n\n"), placeholderNote, scope);
}

export function transformChatMessages(
  messages: any[] = [],
  originalToAlias: Map<string, string> | null = null,
  placeholderNote = "",
  scope: string | null = null
): any[] {
  const out: any[] = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m) continue;
    if (
      originalToAlias &&
      originalToAlias.size > 0 &&
      m.role === "assistant" &&
      Array.isArray(m.tool_calls)
    ) {
      out.push({
        ...m,
        tool_calls: m.tool_calls.map((tc: any) => {
          const fnName = tc?.function?.name;
          if (fnName && originalToAlias.has(fnName)) {
            return { ...tc, function: { ...tc.function, name: originalToAlias.get(fnName) } };
          }
          return tc;
        }),
      });
    } else {
      out.push(m);
    }
  }

  const sysIndex = out.findIndex((m) => m?.role === "system" || m?.role === "developer");
  if (sysIndex === -1) {
    out.unshift({ role: "system", content: withHarnessEnvBlock("", placeholderNote, scope) });
  } else {
    const sys = out[sysIndex];
    if (typeof sys.content === "string") {
      out[sysIndex] = { ...sys, content: withHarnessEnvBlock(sys.content, placeholderNote, scope) };
    } else if (Array.isArray(sys.content)) {
      const text = extractContent(sys.content);
      out[sysIndex] = {
        ...sys,
        content: withHarnessEnvBlock(text, placeholderNote, scope),
      };
    } else {
      out[sysIndex] = { ...sys, content: withHarnessEnvBlock("", placeholderNote, scope) };
    }
  }
  return out;
}

export function transformResponsesContent(content: any, role = "user"): any {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const hasNonText = content.some(
      (p) =>
        p &&
        typeof p === "object" &&
        (p.type === "image_url" || p.type === "input_image" || p.type === "input_file")
    );
    if (!hasNonText) return extractContent(content);
    const textType = role === "assistant" ? "output_text" : "input_text";
    const parts: any[] = [];
    for (const p of content) {
      if (typeof p === "string") {
        parts.push({ type: textType, text: p });
      } else if (p && typeof p === "object") {
        if (p.type === "text" || p.type === "input_text" || p.type === "output_text") {
          parts.push({ type: textType, text: String(p.text ?? "") });
        } else if (p.type === "image_url") {
          const imageUrl = typeof p.image_url === "string" ? p.image_url : p.image_url?.url;
          if (imageUrl) parts.push({ type: "input_image", image_url: imageUrl });
        } else if (p.type === "input_image" || p.type === "input_file") {
          parts.push(p);
        } else if (p.text) {
          parts.push({ type: textType, text: String(p.text) });
        }
      }
    }
    return parts;
  }
  return extractContent(content);
}

export function transformToResponsesInput(messages: any[] = [], originalToAlias: Map<string, string> | null = null): any[] {
  const input: any[] = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m) continue;
    if (m.role === "system" || m.role === "developer") {
      continue;
    }
    if (m.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: m.tool_call_id || "call_unknown",
        output: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
      });
      continue;
    }
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      if (m.content) {
        input.push({
          role: "assistant",
          content: transformResponsesContent(m.content, "assistant"),
        });
      }
      for (const tc of m.tool_calls) {
        const fn = tc.function || {};
        const rawName = fn.name || "unknown";
        const mappedName =
          originalToAlias && originalToAlias.has(rawName) ? originalToAlias.get(rawName) : rawName;
        input.push({
          type: "function_call",
          call_id: tc.id || `call_${crypto.randomBytes(8).toString("hex")}`,
          name: mappedName,
          arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments || {}),
        });
      }
      continue;
    }
    const role = m.role || "user";
    input.push({ role, content: transformResponsesContent(m.content, role) });
  }
  return input;
}

export function buildUpstreamPayload(
  body: ChatCompletionRequest | any,
  targetModel: string,
  useResponses: boolean,
  scope: string | null = null,
  sessionId: string | null = null
): OpenCodePayloadResult {
  let messages = body.messages;
  try {
    messages = tokensaver.applyTokenSavers(messages);
  } catch {}

  const requestedTokens =
    body.max_output_tokens ?? body.max_completion_tokens ?? body.max_tokens;
  const maxTokens = effectiveMaxTokens(requestedTokens, targetModel, body);
  const { tools, placeholderNote, aliasToOriginal, originalToAlias } = prepareToolsWithFingerprint(
    body.tools,
    useResponses,
    scope,
    targetModel
  );

  if (useResponses) {
    const promptCacheKey =
      typeof sessionId === "string" && sessionId.startsWith("ses_")
        ? (sessionId.length === 68 && /^ses_[0-9a-f]{64}$/.test(sessionId) ? sessionId.slice(4) : sessionId)
        : (typeof sessionId === "string" && sessionId ? sessionId : undefined);

    const upstreamBody: any = {
      model: targetModel,
      input: transformToResponsesInput(messages, originalToAlias),
      stream: true,
      max_output_tokens: maxTokens,
      tools,
      tool_choice: "auto",
      ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
    };
    const instructions = extractSystemInstructions(
      messages,
      body.instructions,
      placeholderNote,
      scope
    );
    if (instructions) {
      upstreamBody.instructions = instructions;
    }
    if (typeof body.temperature === "number") upstreamBody.temperature = body.temperature;
    if (typeof body.top_p === "number") upstreamBody.top_p = body.top_p;
    return { upstreamBody, aliasToOriginal, originalToAlias, tools, placeholderNote };
  }

  const promptCacheKey =
    typeof sessionId === "string" && sessionId.startsWith("ses_")
      ? (sessionId.length === 68 && /^ses_[0-9a-f]{64}$/.test(sessionId) ? sessionId.slice(4) : sessionId)
      : (typeof sessionId === "string" && sessionId ? sessionId : undefined);

  const upstreamBody: any = {
    model: targetModel,
    messages: transformChatMessages(messages, originalToAlias, placeholderNote, scope),
    tools,
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: maxTokens,
    ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
    store: false,
  };
  if (typeof body.temperature === "number") upstreamBody.temperature = body.temperature;
  if (typeof body.top_p === "number") upstreamBody.top_p = body.top_p;
  if (body.stop !== undefined) upstreamBody.stop = body.stop;
  if (body.response_format !== undefined) upstreamBody.response_format = body.response_format;
  if (body.reasoning_effort !== undefined) upstreamBody.reasoning_effort = body.reasoning_effort;

  // Upstream v2 rejects tool_choice: "none" with 403 FreeTierError.
  if (body.tool_choice && body.tool_choice !== "none") {
    if (
      typeof body.tool_choice === "object" &&
      body.tool_choice.function?.name &&
      originalToAlias.has(body.tool_choice.function.name)
    ) {
      upstreamBody.tool_choice = {
        ...body.tool_choice,
        function: {
          ...body.tool_choice.function,
          name: originalToAlias.get(body.tool_choice.function.name),
        },
      };
    } else {
      upstreamBody.tool_choice = body.tool_choice;
    }
  }
  return { upstreamBody, aliasToOriginal, originalToAlias, tools, placeholderNote };
}

// --- Headers & Session Affinity ---
let cachedProjectId: string | null = null;
export function getProjectId(): string {
  if (cachedProjectId) return cachedProjectId;
  try {
    const cwd = process.cwd();
    const marker = path.join(cwd, "opencode");
    if (fs.existsSync(marker)) {
      const value = fs.readFileSync(marker, "utf8").trim();
      if (value) return (cachedProjectId = value);
    }

    let remote = "";
    try {
      remote = execFileSync("git", ["remote", "get-url", "origin"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2000,
      }).trim();
    } catch {}

    if (remote) {
      const normalized = remote
        .replace(/^[a-z]+:\/\//i, "")
        .replace(/^git@([^:]+):/i, "$1/")
        .replace(/\.git$/i, "")
        .replace(/\/+$/, "");
      if (normalized) {
        return (cachedProjectId = crypto
          .createHash("sha1")
          .update(`git-remote:${normalized}`)
          .digest("hex"));
      }
    }

    return (cachedProjectId = crypto
      .createHash("sha1")
      .update(`directory:${cwd}`)
      .digest("hex"));
  } catch {
    return (cachedProjectId = "global");
  }
}

export function buildTraceHeaders(): { b3: string; traceparent: string } {
  const traceId = crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  const parentSpanId = crypto.randomBytes(8).toString("hex");
  return {
    b3: `${traceId}-${spanId}-1-${parentSpanId}`,
    traceparent: `00-${traceId}-${spanId}-01`,
  };
}

export function isValidV2UserAgent(ua: string): boolean {
  const match = String(ua || "")
    .trim()
    .match(/^opencode\/[a-z0-9-]+\/(\d+)\.\d+\.\d+\/[a-z0-9-]+$/i);
  return Boolean(match) && parseInt(match![1], 10) >= 2;
}

let currentUserAgent = process.env.OPENCODE_USER_AGENT || identity.getUserAgent();
export function syncUserAgent(): string {
  if (!process.env.OPENCODE_USER_AGENT) currentUserAgent = identity.getUserAgent();
  return currentUserAgent;
}

export function gateSafeUserAgent(): string {
  const override = process.env.OPENCODE_USER_AGENT;
  if (override && /^opencode\/[A-Za-z0-9-]+\/\d+\.\d+\.\d+\/[A-Za-z0-9-]+$/i.test(String(override).trim())) {
    return String(override).trim();
  }
  if (override) {
    console.warn(
      "[AlphaWay] OPENCODE_USER_AGENT does not match the shape the free-tier gate accepts " +
        "(opencode/<channel>/<semver>/<name>); using the derived identity instead"
    );
  }
  const derived = syncUserAgent();
  if (/^opencode\//i.test(derived)) return derived;
  return "opencode/latest/0.0.0/cli";
}

export function buildUpstreamHeaders(req: any, sessionId: string): Record<string, string> {
  const downstreamUa = req?.headers?.["user-agent"] || "";
  const ua = isValidV2UserAgent(downstreamUa) ? downstreamUa : gateSafeUserAgent();
  const client = req?.headers?.["x-opencode-client"];
  const project = req?.headers?.["x-opencode-project"] || getProjectId();
  const { headers: gateHeaders } = identity.buildGateHeaders({
    userAgent: ua,
    client: client === "desktop" || client === "cli" ? client : "cli",
    project: String(project),
    sessionId,
  });
  return {
    Authorization: "Bearer public",
    "Content-Type": "application/json",
    Accept: "*/*",
    "TypeSafe-Danger-Zone-Images": "true",
    ...buildTraceHeaders(),
    ...gateHeaders,
  };
}

export const sessionCache = new Map<string, { sessionId: string; lastSeen: number }>();
export const MAX_SESSIONS = 500;
export const SESSION_TTL_MS = 3 * 3600 * 1000;

export function createId(descending = false, timestamp: number = Date.now()): string {
  return identity.createId(descending, timestamp);
}

export function getPersistentSessionId(req: any, body: any): string {
  const headers = req?.headers || {};
  const rawHeaderKey =
    headers["x-opencode-session"] ||
    headers["x-opencode-session-id"] ||
    headers["x-session-id"] ||
    headers["session-id"] ||
    headers["x-conversation-id"] ||
    headers["x-9r-session-id"];
  const headerKey = Array.isArray(rawHeaderKey)
    ? String(rawHeaderKey[0] || "").slice(0, 256)
    : rawHeaderKey
      ? String(rawHeaderKey).slice(0, 256)
      : "";

  let lookupKey = headerKey ? "hdr:" + headerKey : null;
  if (!lookupKey) {
    const msgs = body && Array.isArray(body.messages) ? body.messages : [];
    if (msgs.length > 0) {
      const sig =
        messageSignatureSample(msgs[0]?.content, 1000) +
        "::" +
        messageSignatureSample(msgs[1]?.content, 1000);
      if (sig !== "::") {
        lookupKey =
          "conv:" + crypto.createHash("sha256").update(sig).digest("hex").slice(0, 20);
      }
    }
  }

  const now = Date.now();
  if (lookupKey && sessionCache.has(lookupKey)) {
    const entry = sessionCache.get(lookupKey)!;
    if (now - entry.lastSeen < SESSION_TTL_MS) {
      // Re-insert to update Map insertion order for O(1) LRU eviction
      sessionCache.delete(lookupKey);
      entry.lastSeen = now;
      sessionCache.set(lookupKey, entry);
      return entry.sessionId;
    }
    sessionCache.delete(lookupKey);
  }

  const freshId = identity.createSessionId(true);
  if (lookupKey) {
    if (sessionCache.size >= MAX_SESSIONS) {
      for (const [k, v] of sessionCache) {
        if (now - v.lastSeen >= SESSION_TTL_MS) sessionCache.delete(k);
      }
      if (sessionCache.size >= MAX_SESSIONS) {
        const lruKey = sessionCache.keys().next().value;
        if (lruKey !== undefined) sessionCache.delete(lruKey);
      }
    }
    sessionCache.set(lookupKey, { sessionId: freshId, lastSeen: now });
  }
  return freshId;
}

export function regenerateSessionId(req: any, body: any, staleId?: string): string {
  if (staleId) {
    for (const [key, entry] of sessionCache.entries()) {
      if (entry.sessionId === staleId) sessionCache.delete(key);
    }
  }
  return getPersistentSessionId(req, body);
}

// --- Model Normalization & Discovery ---
export function isOpenCodeModel(model: string): boolean {
  if (!model || typeof model !== "string") return false;
  const lower = model.toLowerCase();
  if (OPENCODE_PREFIXES.some((p) => lower.startsWith(p))) return true;
  return !codebuddy.isCodebuddyModel(model);
}

export function normalizeModel(rawModel: string | undefined | null): string {
  if (typeof rawModel !== "string") return "";
  let stripped = rawModel.trim();
  while (/^(opencode\/|oc\/|zen\/|9router\/|openai\/|blackrouter\/|ocd\/|cbai\/)/i.test(stripped)) {
    stripped = stripped.replace(/^(opencode\/|oc\/|zen\/|9router\/|openai\/|blackrouter\/|ocd\/|cbai\/)/i, "").trim();
  }
  if (!stripped) return "";
  const lower = stripped.toLowerCase();
  if (lower === "opencode" || lower === "opencode-free" || lower === "default" || lower === "auto") {
    const preferred = identity.getPreferredFreeModel?.() || "big-pickle";
    return preferred;
  }
  const verdict = identity.getCatalogVerdict(lower);
  if (verdict === "free") return stripped;
  const derived = identity.resolveModelAlias(lower);
  if (derived) return derived;
  return stripped;
}

export function resolveEndpoints(modelId: string | null = null): {
  responsesUrl: string;
  chatUrl: string;
  modelsUrl: string;
  responses?: string;
  chat?: string;
  models?: string;
} {
  const derived = identity.getEndpoints(modelId);
  const responsesUrl = process.env.OPENCODE_RESPONSES_URL || derived.responsesUrl || OPENCODE_RESPONSES_URL;
  const chatUrl = process.env.OPENCODE_CHAT_URL || derived.chatUrl || OPENCODE_CHAT_URL;
  const modelsUrl = process.env.OPENCODE_MODELS_URL || derived.modelsUrl || OPENCODE_MODELS_URL;
  return {
    responsesUrl,
    chatUrl,
    modelsUrl,
    responses: responsesUrl,
    chat: chatUrl,
    models: modelsUrl,
  };
}

let activeModels: any[] = [];
let cachedModelsPayload = '{"object":"list","data":[]}';
let lastDiscoveryTime = 0;
export const DISCOVERY_TTL_MS = 60 * 60 * 1000;
let discoveryInFlight: Promise<ModelInfo[]> | null = null;
let lastCliVersionCheckTime = 0;
export const CLI_VERSION_TTL_MS = 6 * 60 * 60 * 1000;

export function rebuildDiscoveryPayloads(): void {
  const combined = [...activeModels];
  const existing = new Set(combined.map((m) => m.id.toLowerCase()));
  for (const m of codebuddy.CODEBUDDY_MODELS) {
    if (!existing.has(m.id.toLowerCase())) {
      combined.push({
        id: m.id,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "codebuddy-intl",
        context_window: m.context_window,
        max_output: m.max_output,
      });
    }
  }
  cachedModelsPayload = JSON.stringify({ object: "list", data: combined });
}

export function getActiveModels(): any[] {
  return activeModels;
}

export function __setActiveModels(models: any[]): void {
  activeModels = models;
  rebuildDiscoveryPayloads();
}

export function __setLastDiscoveryTime(time: number): void {
  lastDiscoveryTime = time;
}

export function __getDiscoveryState(): { inFlight: boolean; lastDiscoveryTime: number; activeModels: any[] } {
  return { inFlight: discoveryInFlight !== null, lastDiscoveryTime, activeModels };
}

export function __setLastCliVersionCheckTime(time: number): void {
  lastCliVersionCheckTime = time;
}

export function __getCliVersionState(): { lastCliVersionCheckTime: number } {
  return { lastCliVersionCheckTime };
}

export async function refreshCliVersion(): Promise<any> {
  const now = Date.now();
  if (now - lastCliVersionCheckTime < CLI_VERSION_TTL_MS) {
    return { updated: false, reason: "fresh" };
  }
  const result = await identity.refresh({ recheck: true });
  syncUserAgent();
  lastCliVersionCheckTime = now;
  return result;
}

export async function discoverModels(): Promise<ModelInfo[]> {
  if (discoveryInFlight) return discoveryInFlight;

  discoveryInFlight = (async () => {
    const now = Date.now();
    refreshCliVersion().catch(() => {});
    try {
      const res = await proxy.netFetch(resolveEndpoints().modelsUrl, {
        headers: {
          Authorization: "Bearer public",
          "User-Agent": currentUserAgent,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = json.data || [];

      const ownedBy = new Map(items.map((i: any) => [String(i.id || "").toLowerCase(), i]));
      const kept: string[] = [];
      const seen = new Set<string>();
      const keep = (id: string) => {
        const lower = String(id).toLowerCase();
        if (seen.has(lower)) return;
        seen.add(lower);
        kept.push(id);
      };

      for (const id of identity.getFreeModels()) keep(id);

      for (const item of items) {
        const id = String(item.id || "");
        const lower = id.toLowerCase();
        if (lower.startsWith("jev-")) continue; // systemone evaluator models
        const verdict = identity.getCatalogVerdict(lower);
        if (verdict) continue; // the catalog already ruled on this id
        if (!lower.endsWith("-free") && !lower.includes("-contributor") && lower !== "big-pickle") continue;
        keep(id);
      }

      activeModels = kept.map((id) => {
        const lower = id.toLowerCase();
        const raw = ownedBy.get(lower) || {};
        return {
          id,
          object: "model" as const,
          created: raw.created || Math.floor(now / 1000),
          owned_by: raw.owned_by || "opencode",
          provider: "opencode",
          name: id,
          permission: [],
          root: id,
          parent: null,
        };
      });
      lastDiscoveryTime = now;
      rebuildDiscoveryPayloads();
    } catch {
      if (activeModels.length === 0) {
        const fallback = identity.getFreeModels();
        const list = fallback.length > 0 ? fallback : DEFAULT_OPENCODE_MODELS;
        activeModels = list.map((id: string) => ({
          id,
          object: "model" as const,
          created: Math.floor(now / 1000),
          owned_by: "opencode-free",
          provider: "opencode",
          name: id,
          permission: [],
          root: id,
          parent: null,
        }));
        rebuildDiscoveryPayloads();
      }
    } finally {
      discoveryInFlight = null;
    }
    return activeModels;
  })();

  return discoveryInFlight;
}

// --- Error Handling & Diagnostics ---
let lastFailedGateRetryTime = 0;
let lastFailedGateRetryEpoch = -1;
let lastIpAbuseAt = 0;
let lastGateDiagnostic: any = null;
let lastUpstreamError: any = null;

const origSessionCacheClear = sessionCache.clear.bind(sessionCache);
sessionCache.clear = () => {
  lastFailedGateRetryTime = 0;
  lastFailedGateRetryEpoch = -1;
  lastIpAbuseAt = 0;
  lastUpstreamError = null;
  return origSessionCacheClear();
};

export const GATE_RETRY_COOLDOWN_MS = 30000;

export function isFreeTierCliGateError(status: number, errTypeOrText: any, errMsg?: string): boolean {
  let errType = typeof errTypeOrText === "string" ? errTypeOrText : "";
  let msg = typeof errMsg === "string" ? errMsg : "";
  if (!msg && typeof errTypeOrText === "string") {
    msg = errTypeOrText;
    try {
      const parsed = JSON.parse(errTypeOrText);
      errType = parsed.error?.type || parsed.type || "";
      msg = parsed.error?.message || parsed.message || errTypeOrText;
    } catch {}
  }
  if (errType === "FreeTierError" || errType === "UpgradeRequired") return true;
  if (status === 426) return true;
  const m = String(msg || "").toLowerCase();
  const isGateMsg =
    m.includes("freetiererror") ||
    m.includes("free tier") ||
    m.includes("free models") ||
    m.includes("opencode cli") ||
    m.includes("only available in opencode") ||
    m.includes("free models work in opencode") ||
    m.includes("upgrade required") ||
    m.includes("or newer is required") ||
    m.includes("freeusagelimiterror");
  if (errType === "FreeUsageLimitError" && isGateMsg) return true;
  if (status === 429 && isGateMsg) return true;
  if (status !== 403 && status !== 401) return false;
  return isGateMsg;
}

export function extractStreamError(ev: any): string | null {
  const err = ev?.error;
  if (!err) return null;
  if (typeof err === "string") return err;
  return err.message || err.type || JSON.stringify(err);
}

export function extractResponsesFinishReason(ev: any, hasToolCalls: boolean): string {
  const status = ev?.response?.status;
  if (status === "completed") return hasToolCalls ? "tool_calls" : "stop";
  if (status === "incomplete") {
    const reason = ev?.response?.incomplete_details?.reason;
    if (reason === "max_output_tokens") return "length";
    return reason || "length";
  }
  return "stop";
}

export function buildIpThrottleHeaders(freeTierMsg: boolean, diagnostic: any = null): Record<string, string> {
  if (!freeTierMsg) return { "Content-Type": "application/json" };
  const retryAfterSec = Math.max(1, Math.ceil(GATE_RETRY_COOLDOWN_MS / 1000));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Retry-After": String(retryAfterSec),
    "X-OpenCode-Gate": diagnostic && diagnostic.shapeOk === false ? "shape-rejected" : "ip-throttled",
  };
  if (diagnostic && diagnostic.logId) headers["X-OpenCode-Log-Id"] = diagnostic.logId;
  return headers;
}

export function resolveIpThrottleStatus(upstreamStatus: number, freeTierMsg: boolean): number {
  if (freeTierMsg && process.env.IP_LIMIT_STATUS === "429") return 429;
  return upstreamStatus;
}

export function auditGateShape(upstreamBody: any, headers: any): GateShapeAudit {
  const tools = Array.isArray(upstreamBody?.tools) ? upstreamBody.tools : [];
  const toolNames = tools.map((t: any) => t?.function?.name || t?.name).filter(Boolean);
  const headerKey = (name: string) =>
    Object.keys(headers || {}).find((k) => k.toLowerCase() === name);
  const hasHeader = (name: string) => headerKey(name) !== undefined;
  const ua = String(headers?.[headerKey("user-agent") || ""] || "");
  const sessionHeaders = ["x-opencode-session", "x-session-affinity", "x-session-id"].filter(hasHeader);
  return {
    hasReadTool: toolNames.includes("read"),
    toolCount: toolNames.length,
    userAgentOk: /^opencode\/[A-Za-z0-9-]+\/\d+\.\d+\.\d+\/[A-Za-z0-9-]+$/i.test(ua),
    userAgent: ua,
    sessionHeaders,
  };
}
export const __auditGateShape = auditGateShape;

export function getLastUpstreamError(): any {
  return lastUpstreamError;
}
export const __getLastUpstreamError = getLastUpstreamError;

export function getGateDiagnostic(): any {
  return lastGateDiagnostic;
}
export const __getGateDiagnostic = getGateDiagnostic;

export function getGateStatus(): {
  status: "ip-blocked" | "throttled" | "open";
  ipBlockedSince: number | null;
  throttledUntil: number | null;
  cooldownMs: number;
} {
  const gateThrottled =
    lastFailedGateRetryTime > 0 &&
    Date.now() - lastFailedGateRetryTime < GATE_RETRY_COOLDOWN_MS;
  return {
    status: lastIpAbuseAt > 0 ? "ip-blocked" : gateThrottled ? "throttled" : "open",
    ipBlockedSince: lastIpAbuseAt || null,
    throttledUntil: gateThrottled ? lastFailedGateRetryTime + GATE_RETRY_COOLDOWN_MS : null,
    cooldownMs: GATE_RETRY_COOLDOWN_MS,
  };
}

export function recordUpstreamError(statusCode: number, model: string, errText: string, responseHeaders?: any): void {
  lastUpstreamError = {
    at: Date.now(),
    statusCode,
    model,
    error: errText,
    logId: responseHeaders?.["x-opencode-log-id"] || null,
  };
}
export const __recordUpstreamError = recordUpstreamError;

export function clearUpstreamError(): void {
  lastUpstreamError = null;
}
export const __clearUpstreamError = clearUpstreamError;

// Concurrency Throttle & Anti-Burst Queue
const MAX_CONCURRENT_UPSTREAM = parseInt(process.env.MAX_CONCURRENT_UPSTREAM || "3", 10);
const REQUEST_SPACING_MS = parseInt(process.env.REQUEST_SPACING_MS || "150", 10);
let activeUpstreamCalls = 0;
let lastRequestStartTime = 0;
const upstreamQueue: Array<{
  resolve: (release: () => void) => void;
  reject: (err: any) => void;
  signal?: AbortSignal;
}> = [];

export function acquireUpstreamSlot(signal?: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Request aborted before slot acquired"));
    const entry = { resolve, reject, signal };
    upstreamQueue.push(entry);
    processNextUpstreamQueue();
  });
}

function processNextUpstreamQueue() {
  if (upstreamQueue.length === 0) return;
  if (activeUpstreamCalls >= MAX_CONCURRENT_UPSTREAM) return;

  const now = Date.now();
  const timeSinceLast = now - lastRequestStartTime;
  if (timeSinceLast < REQUEST_SPACING_MS) {
    setTimeout(processNextUpstreamQueue, REQUEST_SPACING_MS - timeSinceLast);
    return;
  }

  const next = upstreamQueue.shift();
  if (!next) return;
  if (next.signal?.aborted) {
    processNextUpstreamQueue();
    return;
  }

  activeUpstreamCalls++;
  lastRequestStartTime = Date.now();

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeUpstreamCalls = Math.max(0, activeUpstreamCalls - 1);
    processNextUpstreamQueue();
  };

  next.resolve(release);
}

export async function consumeSseLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  onLine: (line: string) => void,
  initialBuffer: string = ""
): Promise<void> {
  let buffer = initialBuffer;
  if (buffer) {
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer.charCodeAt(i) === 10) {
        const line =
          i > start && buffer.charCodeAt(i - 1) === 13
            ? buffer.slice(start, i - 1)
            : buffer.slice(start, i);
        onLine(line);
        start = i + 1;
      }
    }
    buffer = buffer.slice(start);
  }
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      if (buffer.trim()) {
        let start = 0;
        for (let i = 0; i < buffer.length; i++) {
          if (buffer.charCodeAt(i) === 10) {
            const line =
              i > start && buffer.charCodeAt(i - 1) === 13
                ? buffer.slice(start, i - 1)
                : buffer.slice(start, i);
            onLine(line);
            start = i + 1;
          }
        }
        if (start < buffer.length) onLine(buffer.slice(start));
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer.charCodeAt(i) === 10) {
        const line =
          i > start && buffer.charCodeAt(i - 1) === 13
            ? buffer.slice(start, i - 1)
            : buffer.slice(start, i);
        onLine(line);
        start = i + 1;
      }
    }
    buffer = buffer.slice(start);
  }
}

function recordEgressFailure(state: any, { reason, cooldownMs = null }: { reason: string; cooldownMs?: number | null }): void {
  const url = state && state.egressUrl;
  if (url === null || url === undefined) return;
  const pool = proxy.describe().pool;
  if (!pool || !pool.active) return;
  proxy.markFailure(url, { reason, cooldownMs });
}

const UPDATE_HINT =
  "Update AlphaWay: curl -fsSL https://raw.githubusercontent.com/yoganataa/alphaway/main/install.sh | bash";

function upstreamLogIdOf(res: any): string | null {
  if (typeof res?.headers?.get === "function") {
    return res.headers.get("x-opencode-log-id") || null;
  }
  return res?.headers?.["x-opencode-log-id"] || null;
}

export async function handleOpenCodeChat(
  rawReq: any,
  body: any,
  targetModel: string,
  clientStream: boolean,
  signal?: AbortSignal
): Promise<Response> {
  identity.ensureFresh();
  syncUserAgent();

  let useResponses = isResponsesModel(targetModel);
  const sessionId = getPersistentSessionId(rawReq, body);
  let retryHeaders: any = null;
  const upstreamHeaders = buildUpstreamHeaders(rawReq, sessionId);

  let releaseSlot: (() => void) | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    try {
      releaseSlot = await acquireUpstreamSlot(signal);
    } catch {
      return new Response(
        JSON.stringify({ error: { message: "Client cancelled while queued", type: "client_closed_request" } }),
        { status: 499, headers: { "Content-Type": "application/json" } }
      );
    }

    let { upstreamBody, aliasToOriginal } = buildUpstreamPayload(
      body,
      targetModel,
      useResponses,
      process.env.TOOL_PROFILE_SCOPE || "full",
      sessionId
    );
    let liveEndpoints = resolveEndpoints(targetModel);
    let upstreamUrl = useResponses ? liveEndpoints.responsesUrl : liveEndpoints.chatUrl;

    const egressState: any = { egress: proxy.pick(), egressUrl: null, transportFailures: 0 };
    egressState.egressUrl = egressState.egress.url;
    const egressUrl = () => egressState.egressUrl;

    let upstreamRes: any = await proxy.netFetch(
      upstreamUrl,
      {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(upstreamBody),
        signal,
      },
      egressUrl()
    );

    // 1. ModelProtocolUnsupported (400) retry
    if (!upstreamRes.ok && upstreamRes.status === 400) {
      const errText = await upstreamRes.text();
      let errJson: any;
      try {
        errJson = JSON.parse(errText);
      } catch {
        errJson = { message: errText };
      }
      const errType = errJson.error?.type || "";
      const errMsg = errJson.error?.message || errJson.message || "";
      if (
        errType === "ModelProtocolUnsupported" ||
        errMsg.includes("ModelProtocolUnsupported") ||
        errMsg.includes("does not support this protocol")
      ) {
        useResponses = !useResponses;
        markProtocolSupport(targetModel, useResponses);
        ({ upstreamBody, aliasToOriginal } = buildUpstreamPayload(
          body,
          targetModel,
          useResponses,
          process.env.TOOL_PROFILE_SCOPE || "full",
          sessionId
        ));
        upstreamUrl = useResponses ? liveEndpoints.responsesUrl : liveEndpoints.chatUrl;
        upstreamRes = await proxy.netFetch(
          upstreamUrl,
          {
            method: "POST",
            headers: upstreamHeaders,
            body: JSON.stringify(upstreamBody),
            signal,
          },
          egressUrl()
        );
      } else {
        return new Response(
          JSON.stringify({
            error: {
              message: errMsg || "Upstream error 400",
              type: errType || "upstream_error",
              code: 400,
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 2. Endpoint migration (404 / 410) retry
    let consumedErrorText: string | null = null;
    if (!upstreamRes.ok && (upstreamRes.status === 404 || upstreamRes.status === 410)) {
      const staleUrl = upstreamUrl;
      let moveText = "";
      try {
        moveText = await upstreamRes.text();
      } catch {}
      consumedErrorText = moveText;
      let moveErrType = "";
      try {
        const j = JSON.parse(moveText);
        moveErrType = j?.error?.type || j?.type || "";
      } catch {}
      const modelLevelError = /model(deprecated|unavailable|protocolunsupported)/i.test(moveErrType);

      if (!modelLevelError) {
        await identity.refresh({ force: true }).catch(() => null);
        liveEndpoints = resolveEndpoints(targetModel);
        const derivedUrl = useResponses ? liveEndpoints.responsesUrl : liveEndpoints.chatUrl;
        if (derivedUrl && derivedUrl !== staleUrl) {
          console.warn(`[AlphaWay] Upstream endpoint moved (${upstreamRes.status}): ${staleUrl} → ${derivedUrl}; retrying once`);
          upstreamUrl = derivedUrl;
          upstreamRes = await proxy.netFetch(
            upstreamUrl,
            {
              method: "POST",
              headers: upstreamHeaders,
              body: JSON.stringify(upstreamBody),
              signal,
            },
            egressUrl()
          );
          consumedErrorText = null;
        }
      }
    }

    // 3. Allowance 429 failover / session rotation
    if (!upstreamRes.ok && upstreamRes.status === 429) {
      if (consumedErrorText === null) {
        try {
          consumedErrorText = await upstreamRes.text();
        } catch {
          consumedErrorText = "";
        }
      }
      let errJson: any = null;
      try {
        errJson = JSON.parse(consumedErrorText!);
      } catch {}
      const errType = errJson?.error?.type || errJson?.type || "";
      const rawMsg = errJson?.error?.message || errJson?.message || consumedErrorText || "";
      const isGateError = isFreeTierCliGateError(upstreamRes.status, errType, rawMsg);
      const poolState = proxy.describe().pool;
      const canFailover = poolState && poolState.active && poolState.enabled > 1;

      if (canFailover) {
        recordEgressFailure(egressState, { reason: "allowance 429", cooldownMs: poolState.cooldownMs * 4 });
        const next = proxy.pick({ exclude: egressState.egressUrl });
        if (next.url !== egressState.egressUrl) {
          console.warn(`[AlphaWay] Egress ${proxy.displayHost(egressState.egressUrl) || "direct"} is out of allowance (429); retrying through ${proxy.displayHost(next.url) || "direct"}`);
          egressState.egress = next;
          egressState.egressUrl = next.url;
          upstreamRes = await proxy.netFetch(
            upstreamUrl,
            {
              method: "POST",
              headers: upstreamHeaders,
              body: JSON.stringify(upstreamBody),
              signal,
            },
            egressUrl()
          );
          consumedErrorText = null;
          if (upstreamRes.status === 429) {
            recordEgressFailure(egressState, { reason: "allowance 429", cooldownMs: poolState.cooldownMs * 4 });
          }
        }
      } else if (isGateError || /free\s*usage\s*limit/i.test(rawMsg)) {
        const freshSessionId = regenerateSessionId(rawReq, body, sessionId);
        const freshHeaders = buildUpstreamHeaders(rawReq, freshSessionId);
        const { upstreamBody: retryBody } = buildUpstreamPayload(body, targetModel, useResponses, "full", freshSessionId);
        console.warn(`[AlphaWay] Session out of allowance (429); rotating to fresh session and retrying once`);
        upstreamRes = await proxy.netFetch(
          upstreamUrl,
          {
            method: "POST",
            headers: freshHeaders,
            body: JSON.stringify(retryBody),
            signal,
          },
          egressUrl()
        );
        consumedErrorText = null;
      }

      if (!upstreamRes.ok && upstreamRes.status === 429) {
        const poolStateNow = proxy.describe().pool;
        const canFailoverNow = poolStateNow && poolStateNow.active && poolStateNow.enabled > 1;
        recordEgressFailure(egressState, { reason: "allowance 429", cooldownMs: poolStateNow ? poolStateNow.cooldownMs * 4 : null });
        if (canFailoverNow) {
          const next = proxy.pick({ exclude: egressState.egressUrl });
          if (next.url !== egressState.egressUrl) {
            console.warn(`[AlphaWay] Egress ${proxy.displayHost(egressState.egressUrl) || "direct"} is out of allowance (429); retrying through ${proxy.displayHost(next.url) || "direct"}`);
            egressState.egress = next;
            egressState.egressUrl = next.url;
            upstreamRes = await proxy.netFetch(
              upstreamUrl,
              {
                method: "POST",
                headers: upstreamHeaders,
                body: JSON.stringify(upstreamBody),
                signal,
              },
              egressUrl()
            );
            consumedErrorText = null;
            if (upstreamRes.status === 429) {
              recordEgressFailure(egressState, { reason: "allowance 429", cooldownMs: poolStateNow.cooldownMs * 4 });
            }
          }
        }
      }
    }

    // 4. Transient 5xx retry
    if (!upstreamRes.ok && upstreamRes.status >= 500 && upstreamRes.status < 600) {
      const first5xx = upstreamRes.status;
      const firstLogId = upstreamLogIdOf(upstreamRes);
      try {
        await upstreamRes.text();
      } catch {}
      const retry5xxSid = regenerateSessionId(rawReq, body, sessionId);
      const retry5xxHeaders = buildUpstreamHeaders(rawReq, retry5xxSid);
      console.warn(`[AlphaWay] Upstream returned ${first5xx}` + (firstLogId ? ` [x-opencode-log-id: ${firstLogId}]` : "") + `; retrying once with fresh session`);
      upstreamRes = await proxy.netFetch(
        upstreamUrl,
        {
          method: "POST",
          headers: retry5xxHeaders,
          body: JSON.stringify(upstreamBody),
          signal,
        },
        egressUrl()
      );
      consumedErrorText = null;
    }

    // 5. Gate Rejection (403 / 426)
    if (!upstreamRes.ok) {
      let errText = consumedErrorText ?? "";
      if (consumedErrorText === null) {
        try {
          errText = await upstreamRes.text();
        } catch {
          errText = "";
        }
      }
      let errJson: any = null;
      try {
        errJson = JSON.parse(errText);
      } catch {
        errJson = null;
      }
      const errType = errJson?.error?.type || errJson?.type || "";
      const rawMsg = errJson?.error?.message || errJson?.message || errText || `Upstream error ${upstreamRes.status}`;

      // Terminal IP abuse block
      if (identity.isIpAbuseRejection(upstreamRes.status, rawMsg)) {
        recordEgressFailure(egressState, { reason: "ip-abuse block" });
        lastIpAbuseAt = Date.now();
        const logId = upstreamLogIdOf(upstreamRes);
        lastGateDiagnostic = {
          at: lastIpAbuseAt,
          kind: "ip-abuse",
          status: upstreamRes.status,
          logId,
          message: rawMsg,
          model: targetModel,
        };
        console.warn(`[AlphaWay] Upstream IP-abuse block (${upstreamRes.status}): ${rawMsg} - not refreshing or retrying; the gateway keys this to this network's IP, so no identity change can clear it` + (logId ? ` [x-opencode-log-id: ${logId}]` : ""));
        const abuseHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          "X-OpenCode-Gate": "ip-abuse",
        };
        if (logId) abuseHeaders["X-OpenCode-Log-Id"] = logId;
        return new Response(
          JSON.stringify({
            error: {
              message: rawMsg,
              type: errType || "upstream_error",
              code: upstreamRes.status,
              ...(logId ? { log_id: logId } : {}),
            },
          }),
          { status: upstreamRes.status, headers: abuseHeaders }
        );
      }

      if (!isFreeTierCliGateError(upstreamRes.status, errType, rawMsg)) {
        const upstreamLogId = upstreamLogIdOf(upstreamRes);
        const cfRay =
          typeof upstreamRes.headers?.get === "function"
            ? upstreamRes.headers.get("cf-ray")
            : upstreamRes.headers?.["cf-ray"] || null;
        const cfPlacement =
          typeof upstreamRes.headers?.get === "function"
            ? upstreamRes.headers.get("cf-placement")
            : upstreamRes.headers?.["cf-placement"] || null;
        if (upstreamRes.status >= 500) {
          lastUpstreamError = {
            at: Date.now(),
            status: upstreamRes.status,
            logId: upstreamLogId,
            cfRay,
            cfPlacement,
            message: rawMsg,
            model: targetModel,
          };
          console.warn(`[AlphaWay] Upstream server error (${upstreamRes.status}) on model ${targetModel}: ${rawMsg}` + (upstreamLogId ? ` [x-opencode-log-id: ${upstreamLogId}]` : "") + (cfRay ? ` [cf-ray: ${cfRay}]` : "") + (cfPlacement ? ` [cf-placement: ${cfPlacement}]` : ""));
        }
        const errHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (upstreamLogId) errHeaders["X-OpenCode-Log-Id"] = upstreamLogId;
        if (upstreamRes.status >= 500) errHeaders["X-OpenCode-Gate"] = "upstream-error";
        return new Response(
          JSON.stringify({
            error: {
              message: rawMsg,
              type: errType || "upstream_error",
              code: upstreamRes.status,
              ...(upstreamLogId ? { log_id: upstreamLogId } : {}),
            },
          }),
          { status: upstreamRes.status, headers: errHeaders }
        );
      }

      const gateStatus = upstreamRes.status;
      const verdict = await identity
        .onGateRejection(gateStatus, errType, rawMsg, false)
        .catch(() => ({ retry: false, reason: "refresh-error" }));

      syncUserAgent();
      const retrySessionId = regenerateSessionId(rawReq, body, sessionId);
      const currentEpoch = identity.getState().epoch || 0;
      const skipCooldownRetry =
        !verdict.retry &&
        lastFailedGateRetryTime > 0 &&
        Date.now() - lastFailedGateRetryTime < GATE_RETRY_COOLDOWN_MS &&
        lastFailedGateRetryEpoch === currentEpoch;

      if (!skipCooldownRetry) {
        const pooled = proxy.describe().pool;
        const canFailover = pooled && pooled.active && pooled.enabled > 1;
        if (canFailover && egressState.egressUrl) {
          proxy.markFailure(egressState.egressUrl, {
            reason: `gate ${gateStatus}`,
            cooldownMs: gateStatus === 429 ? pooled.cooldownMs * 4 : null,
          });
          const next = proxy.pick({ exclude: egressState.egressUrl });
          if (next.url && next.url !== egressState.egressUrl) {
            console.warn(`[AlphaWay] Gate refused egress ${proxy.displayHost(egressState.egressUrl) || "direct"} (${gateStatus}); moving to ${proxy.displayHost(next.url) || "direct"} for the retry`);
            egressState.egress = next;
            egressState.egressUrl = next.url;
          }
        }

        console.warn(`[AlphaWay] Upstream CLI gate rejected request (${gateStatus}, ${verdict.reason || "unknown"}); refreshing identity and retrying once with full tool set`);
        ({ upstreamBody, aliasToOriginal } = buildUpstreamPayload(
          body,
          targetModel,
          useResponses,
          "full",
          retrySessionId
        ));
        liveEndpoints = resolveEndpoints(targetModel);
        upstreamUrl = useResponses ? liveEndpoints.responsesUrl : liveEndpoints.chatUrl;
        retryHeaders = buildUpstreamHeaders(rawReq, retrySessionId);
        upstreamRes = await proxy.netFetch(
          upstreamUrl,
          {
            method: "POST",
            headers: retryHeaders,
            body: JSON.stringify(upstreamBody),
            signal,
          },
          egressUrl()
        );
      } else {
        console.warn(`[AlphaWay] Upstream CLI gate rejected request (${gateStatus}); skipping retry because a full-shape retry already failed <${Math.round(GATE_RETRY_COOLDOWN_MS / 1000)}s ago on the current identity (IP cooldown active)`);
      }

      if (!upstreamRes.ok) {
        let retryText = errText;
        let retryJson = errJson;
        if (!skipCooldownRetry) {
          retryText = "";
          try {
            retryText = await upstreamRes.text();
          } catch {}
          retryJson = null;
          try {
            retryJson = JSON.parse(retryText);
          } catch {}
        }
        const retryType = retryJson?.error?.type || retryJson?.type || errType || "upstream_error";
        const retryMsg = retryJson?.error?.message || retryJson?.message || retryText || rawMsg;
        const retryStatus = upstreamRes.status;

        if (identity.isIpAbuseRejection(retryStatus, retryMsg)) {
          if (!skipCooldownRetry) {
            lastFailedGateRetryTime = Date.now();
            lastFailedGateRetryEpoch = identity.getState().epoch || 0;
          }
          recordEgressFailure(egressState, { reason: "ip-abuse block" });
          const logId = upstreamLogIdOf(upstreamRes);
          lastGateDiagnostic = {
            at: Date.now(),
            kind: "ip-abuse",
            status: retryStatus,
            logId,
            message: retryMsg,
            model: targetModel,
          };
          const abuseHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            "X-OpenCode-Gate": "ip-abuse",
          };
          if (logId) abuseHeaders["X-OpenCode-Log-Id"] = logId;
          return new Response(
            JSON.stringify({
              error: {
                message: retryMsg,
                type: retryType,
                code: retryStatus,
                ...(logId ? { log_id: logId } : {}),
              },
            }),
            { status: retryStatus, headers: abuseHeaders }
          );
        }

        const retryFreeTierMsg = /freetiererror|free tier|free models|only available in opencode/i.test(retryMsg);
        const isGateRejection = retryStatus !== 429 && isFreeTierCliGateError(retryStatus, retryType, retryMsg);
        const capacity = retryStatus === 429;
        if (capacity) {
          lastFailedGateRetryTime = 0;
        } else if (!skipCooldownRetry && isGateRejection) {
          lastFailedGateRetryTime = Date.now();
          lastFailedGateRetryEpoch = identity.getState().epoch || 0;
        }

        recordEgressFailure(egressState, {
          reason: capacity ? "allowance 429" : `gate ${retryStatus}`,
          cooldownMs: capacity ? proxy.describe().pool.cooldownMs * 4 : null,
        });

        const shape = auditGateShape(upstreamBody, retryHeaders || upstreamHeaders);
        const shapeOk = shape.hasReadTool && shape.userAgentOk && shape.sessionHeaders.length > 0;
        const upstreamLogId = upstreamLogIdOf(upstreamRes);
        lastGateDiagnostic = {
          at: Date.now(),
          kind: "free-tier-gate",
          status: retryStatus,
          logId: upstreamLogId,
          shape,
          shapeOk,
          missing: [],
          model: targetModel,
        };

        const outStatus = resolveIpThrottleStatus(upstreamRes.status, retryFreeTierMsg && !capacity);
        const outHeaders = buildIpThrottleHeaders(retryFreeTierMsg && !capacity, { shapeOk, logId: upstreamLogId });
        return new Response(
          JSON.stringify({
            error: {
              message: retryFreeTierMsg ? retryMsg : `${retryMsg} (${UPDATE_HINT})`,
              type: retryType,
              code: outStatus,
            },
          }),
          { status: outStatus, headers: outHeaders }
        );
      }
    }

    lastFailedGateRetryTime = 0;
    lastIpAbuseAt = 0;
    proxy.markSuccess(egressState.egressUrl);

    const completionId = `chatcmpl-${crypto.randomBytes(12).toString("hex")}`;
    const created = Math.floor(Date.now() / 1000);
    reader = upstreamRes.body.getReader();
    const decoder = new TextDecoder();

    // Streaming path
    if (clientStream) {
      let initialBuffer = "";
      let firstError: { message: string; type?: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        initialBuffer += decoder.decode(value, { stream: true });
        if (initialBuffer.includes("\n")) {
          const lines = initialBuffer.split("\n");
          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (line.startsWith("data: ")) {
              const raw = line.slice(6).trim();
              if (raw && raw !== "[DONE]") {
                try {
                  const ev = JSON.parse(raw);
                  const inStreamError = extractStreamError(ev);
                  if (inStreamError) {
                    firstError = { message: inStreamError, type: ev?.error?.type };
                    break;
                  }
                } catch {}
              }
            }
          }
          break;
        }
      }

      if (firstError) {
        console.warn(`[AlphaWay] Upstream failed inside the stream: ${firstError.message}`);
        reader.cancel().catch(() => {});
        return new Response(
          JSON.stringify({
            error: {
              message: firstError.message,
              type: firstError.type || "upstream_error",
              code: 502,
            },
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const encoder = new TextEncoder();
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      const writeSse = (payload: string) => {
        writer.write(encoder.encode(payload)).catch(() => {});
      };

      const emitStreamError = (errMessage: string, errType?: string) => {
        console.warn(`[AlphaWay] Upstream failed inside the stream: ${errMessage}`);
        if (reader) reader.cancel().catch(() => {});
        writeSse(`data: ${JSON.stringify({ error: { message: errMessage, type: errType || "upstream_error", code: 502 } })}\n\n`);
        writeSse("data: [DONE]\n\n");
        writer.close().catch(() => {});
      };

      // Process lines asynchronously
      (async () => {
        try {
          if (useResponses) {
            const toolIndexMap = new Map<string, number>();
            let nextToolIndex = 0;
            let hasToolCalls = false;
            let upstreamFinishReason: string | null = null;
            let streamUsage: any = null;
            let streamAbortedByError = false;

            const handleResponsesStreamLine = (line: string) => {
              if (streamAbortedByError) return;
              if (!line.startsWith("data: ")) return;
              const rawJson = line.slice(6).trim();
              if (!rawJson || rawJson === "[DONE]") return;

              try {
                const ev = JSON.parse(rawJson);
                const inStreamError = extractStreamError(ev);
                if (inStreamError) {
                  streamAbortedByError = true;
                  emitStreamError(inStreamError, ev?.error?.type);
                  return;
                }
                if (ev.type === "response.output_text.delta" && ev.delta) {
                  const sanitizedDelta = tokensaver.sanitizeInboundContent(ev.delta);
                  writeSse(`data: ${JSON.stringify({
                    id: completionId,
                    object: "chat.completion.chunk",
                    created,
                    model: targetModel,
                    choices: [{ index: 0, delta: { content: sanitizedDelta }, finish_reason: null }],
                  })}\n\n`);
                } else if (
                  (ev.type === "response.reasoning_summary_text.delta" ||
                    ev.type === "response.reasoning_text.delta" ||
                    ev.type === "response.reasoning.delta") &&
                  ev.delta
                ) {
                  writeSse(`data: ${JSON.stringify({
                    id: completionId,
                    object: "chat.completion.chunk",
                    created,
                    model: targetModel,
                    choices: [{ index: 0, delta: { reasoning_content: ev.delta }, finish_reason: null }],
                  })}\n\n`);
                } else if (ev.type === "response.output_item.added" && ev.item?.type === "function_call") {
                  hasToolCalls = true;
                  const key = ev.output_index !== undefined ? String(ev.output_index) : ev.item.call_id || ev.item.id || String(nextToolIndex);
                  let toolIdx = toolIndexMap.get(key);
                  if (toolIdx === undefined) {
                    toolIdx = nextToolIndex++;
                    toolIndexMap.set(key, toolIdx);
                    if (ev.item.call_id) toolIndexMap.set(ev.item.call_id, toolIdx);
                    if (ev.item.id) toolIndexMap.set(ev.item.id, toolIdx);
                  }
                  const restoredName = restoreClientToolName(ev.item.name, aliasToOriginal);
                  writeSse(`data: ${JSON.stringify({
                    id: completionId,
                    object: "chat.completion.chunk",
                    created,
                    model: targetModel,
                    choices: [{
                      index: 0,
                      delta: {
                        tool_calls: [{
                          index: toolIdx,
                          id: ev.item.call_id || ev.item.id || `call_${toolIdx}`,
                          type: "function",
                          function: { name: restoredName, arguments: "" },
                        }],
                      },
                      finish_reason: null,
                    }],
                  })}\n\n`);
                } else if (ev.type === "response.function_call_arguments.delta" && ev.delta) {
                  const key = ev.output_index !== undefined ? String(ev.output_index) : ev.item_id || ev.call_id;
                  const toolIdx = key !== undefined && toolIndexMap.has(key) ? toolIndexMap.get(key)! : 0;
                  writeSse(`data: ${JSON.stringify({
                    id: completionId,
                    object: "chat.completion.chunk",
                    created,
                    model: targetModel,
                    choices: [{
                      index: 0,
                      delta: {
                        tool_calls: [{ index: toolIdx, function: { arguments: ev.delta } }],
                      },
                      finish_reason: null,
                    }],
                  })}\n\n`);
                } else if (ev.type === "response.completed" || ev.type === "response.incomplete") {
                  upstreamFinishReason = extractResponsesFinishReason(ev, hasToolCalls);
                  if (ev.response?.usage) {
                    streamUsage = {
                      prompt_tokens: ev.response.usage.input_tokens || 0,
                      completion_tokens: ev.response.usage.output_tokens || 0,
                      total_tokens: ev.response.usage.total_tokens || 0,
                    };
                  }
                }
              } catch {}
            };

            await consumeSseLines(reader!, decoder, handleResponsesStreamLine, initialBuffer);
            if (streamAbortedByError) return;

            const finalFinishReason = upstreamFinishReason || (hasToolCalls ? "tool_calls" : "stop");
            writeSse(`data: ${JSON.stringify({
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: targetModel,
              choices: [{ index: 0, delta: {}, finish_reason: finalFinishReason }],
            })}\n\n`);
            if (body.stream_options?.include_usage && streamUsage) {
              writeSse(`data: ${JSON.stringify({
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: targetModel,
                choices: [],
                usage: streamUsage,
              })}\n\n`);
            }
            writeSse("data: [DONE]\n\n");
            writer.close().catch(() => {});
          } else {
            // Chat lane
            const hasAliases = aliasToOriginal.size > 0;
            let streamAbortedByError = false;

            const handleChatStreamLine = (line: string) => {
              if (streamAbortedByError) return;
              if (!line.startsWith("data: ")) return;
              const raw = line.slice(6).trim();
              if (!raw) return;
              if (raw === "[DONE]") {
                writeSse("data: [DONE]\n\n");
                return;
              }
              if (raw.includes('"error"')) {
                try {
                  const maybe = JSON.parse(raw);
                  const streamErr = extractStreamError(maybe);
                  if (streamErr) {
                    streamAbortedByError = true;
                    emitStreamError(streamErr, maybe?.error?.type);
                    return;
                  }
                } catch {}
              }
              try {
                const chunk = JSON.parse(raw);
                const delta = chunk.choices?.[0]?.delta;
                if (delta?.content) {
                  delta.content = tokensaver.sanitizeInboundContent(delta.content);
                }
                if (delta && delta.reasoning && !delta.reasoning_content) {
                  delta.reasoning_content = delta.reasoning;
                }
                if (delta?.reasoning_content) {
                  delta.reasoning_content = tokensaver.sanitizeInboundContent(delta.reasoning_content);
                }
                if (hasAliases && Array.isArray(delta?.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    if (tc.function?.name) {
                      tc.function.name = restoreClientToolName(tc.function.name, aliasToOriginal);
                    }
                  }
                }
                writeSse(`data: ${JSON.stringify(chunk)}\n\n`);
              } catch {
                writeSse(`data: ${raw}\n\n`);
              }
            };

            await consumeSseLines(reader!, decoder, handleChatStreamLine, initialBuffer);
            if (!streamAbortedByError) {
              writeSse("data: [DONE]\n\n");
              writer.close().catch(() => {});
            }
          }
        } catch (err) {
          writer.abort(err).catch(() => {});
        }
      })();

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Non-streaming path
    let assistantText = "";
    let reasoningText = "";
    const toolCalls: any[] = [];
    const nonStreamToolMap = new Map<string, any>();
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let upstreamFinishReason: string | null = null;
    let streamError: string | null = null;

    const handleNonStreamLine = (line: string) => {
      if (!line.startsWith("data: ")) return;
      const rawJson = line.slice(6).trim();
      if (!rawJson || rawJson === "[DONE]") return;

      try {
        const ev = JSON.parse(rawJson);
        const inStreamError = extractStreamError(ev);
        if (inStreamError) {
          streamError = inStreamError;
          return;
        }

        if (useResponses) {
          if (ev.type === "response.output_text.delta" && ev.delta) {
            assistantText += ev.delta;
          } else if (
            (ev.type === "response.reasoning_summary_text.delta" ||
              ev.type === "response.reasoning_text.delta" ||
              ev.type === "response.reasoning.delta") &&
            ev.delta
          ) {
            reasoningText += ev.delta;
          } else if (ev.type === "response.output_item.added" && ev.item?.type === "function_call") {
            const key = ev.output_index !== undefined ? String(ev.output_index) : ev.item.call_id || ev.item.id || String(toolCalls.length);
            const tc = {
              id: ev.item.call_id || ev.item.id || `call_${toolCalls.length}`,
              type: "function",
              function: {
                name: restoreClientToolName(ev.item.name, aliasToOriginal),
                arguments: "",
              },
            };
            toolCalls.push(tc);
            nonStreamToolMap.set(key, tc);
            if (ev.item.call_id) nonStreamToolMap.set(ev.item.call_id, tc);
            if (ev.item.id) nonStreamToolMap.set(ev.item.id, tc);
          } else if (ev.type === "response.function_call_arguments.delta" && ev.delta) {
            const key = ev.output_index !== undefined ? String(ev.output_index) : ev.item_id || ev.call_id;
            const targetTc = key !== undefined && nonStreamToolMap.has(key) ? nonStreamToolMap.get(key) : toolCalls[toolCalls.length - 1];
            if (targetTc) targetTc.function.arguments += ev.delta;
          } else if (ev.type === "response.completed" || ev.type === "response.incomplete") {
            upstreamFinishReason = extractResponsesFinishReason(ev, toolCalls.length > 0);
            if (ev.response?.usage) {
              usage = {
                prompt_tokens: ev.response.usage.input_tokens || 0,
                completion_tokens: ev.response.usage.output_tokens || 0,
                total_tokens: ev.response.usage.total_tokens || 0,
              };
            }
          }
        } else {
          const choice = ev.choices?.[0];
          if (choice?.finish_reason) {
            upstreamFinishReason = choice.finish_reason;
          }
          const delta = choice?.delta;
          if (delta?.content) assistantText += delta.content;
          if (delta?.reasoning) reasoningText += delta.reasoning;
          else if (delta?.reasoning_content) reasoningText += delta.reasoning_content;
          if (Array.isArray(delta?.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? toolCalls.length;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id || `call_${idx}`,
                  type: "function",
                  function: {
                    name: restoreClientToolName(tc.function?.name || "", aliasToOriginal),
                    arguments: "",
                  },
                };
              } else {
                if (tc.id && toolCalls[idx].id.startsWith("call_")) {
                  toolCalls[idx].id = tc.id;
                }
                if (tc.function?.name && !toolCalls[idx].function.name) {
                  toolCalls[idx].function.name = restoreClientToolName(tc.function.name, aliasToOriginal);
                }
              }
              if (tc.function?.arguments) {
                toolCalls[idx].function.arguments += tc.function.arguments;
              }
            }
          }
          if (ev.usage && typeof ev.usage === "object") {
            usage = {
              prompt_tokens: ev.usage.prompt_tokens || 0,
              completion_tokens: ev.usage.completion_tokens || 0,
              total_tokens: ev.usage.total_tokens || 0,
            };
          }
        }
      } catch {}
    };

    await consumeSseLines(reader, decoder, handleNonStreamLine);

    if (streamError) {
      console.warn(`[AlphaWay] Upstream failed inside the stream: ${streamError}`);
      return new Response(
        JSON.stringify({ error: { message: streamError, type: "upstream_error", code: 502 } }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const validToolCalls = toolCalls.filter(Boolean);
    const sanitizedAssistantText = assistantText ? tokensaver.sanitizeInboundContent(assistantText) : null;
    const sanitizedReasoningText = reasoningText ? tokensaver.sanitizeInboundContent(reasoningText) : "";
    const messageObj: any = { role: "assistant", content: sanitizedAssistantText };
    if (sanitizedReasoningText) messageObj.reasoning_content = sanitizedReasoningText;
    if (validToolCalls.length > 0) messageObj.tool_calls = validToolCalls;

    let finishReason = upstreamFinishReason || "stop";
    if (validToolCalls.length > 0 && finishReason !== "length" && finishReason !== "content_filter") {
      finishReason = "tool_calls";
    }

    return new Response(
      JSON.stringify({
        id: completionId,
        object: "chat.completion",
        created,
        model: targetModel,
        choices: [
          {
            index: 0,
            message: messageObj,
            finish_reason: finishReason,
          },
        ],
        usage,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    if (releaseSlot) releaseSlot();
  }
}

export { readRequestBody, MAX_BODY_BYTES } from "../core/admin-guard";

import { server } from "../core/server-adapter";
export { server };

export function syncUserAgent() {
  if (!process.env.OPENCODE_USER_AGENT) currentUserAgent = identity.getUserAgent();
  return currentUserAgent;
}
export const __syncUserAgent = syncUserAgent;
