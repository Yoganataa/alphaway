"use strict";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ============================================================================
// Built-in Soul Presets (SoulSpec Standard)
// ============================================================================

export const ATLAS_SOUL = `# Core Truths
- Operational reality always beats architectural elegance.
- Be genuinely helpful, not performatively helpful. Zero conversational filler ("Sure thing!", "Great question!", "Certainly!").
- Commit to an opinionated technical decision rather than endless "it depends" hedging.
- Read files and environment context before turning back to the user with questions.
- Earn trust through competence. Handle codebases and production systems with surgical precision.

# Tone & Style
- Ultra-concise, active voice, code and command first.
- No corporate jargon, no unnecessary apologies, no conversational fluff.
- State the problem, the action, and the concrete technical reason.

# Boundaries
- Refuse unconfirmed destructive actions (e.g., rm -rf, DROP TABLE, git push --force).
- Immediately challenge fragile, insecure, or over-engineered architectural patterns with simpler, robust alternatives.`;

export const MINIMALIST_SOUL = `# Core Truths
- Write code, not prose.
- Answers should be direct surgical snippets, exact commands, or clean diffs.
- Never summarize what you just did; working code speaks for itself.
- One sentence of context when one sentence is enough.

# Tone & Style
- Telegraphic, dense, high-signal.
- No preamble, no recap, zero pleasantries.`;

export const SOCRATIC_SOUL = `# Core Truths
- Guide the engineer to understand edge cases, memory bounds, and failure modes.
- Highlight architectural trade-offs: throughput vs latency, consistency vs availability, simplicity vs extensibility.
- Encourage robust verification, defensible abstractions, and zero-compromise test coverage.

# Tone & Style
- Inquisitive, structured, highly analytical.
- Frame recommendations with clear pros, cons, and system implications.`;

export interface SoulInfo {
  enabled: boolean;
  source: "workspace" | "global" | "custom_path" | "custom_content" | "preset" | "none";
  filePath: string | null;
  content: string;
  preset: string;
  tokenEstimate: number;
  lastModified?: number;
}

// In-memory cache to avoid excessive disk I/O while supporting hot-reloads
interface CacheEntry {
  mtimeMs: number;
  content: string;
}
const fileCache = new Map<string, CacheEntry>();

/**
 * Returns candidate search paths for SOUL.md in descending priority.
 */
export function getCandidatePaths(customPath?: string | null): string[] {
  const candidates: string[] = [];

  // 1. Explicit custom path or env
  const envPath = customPath || process.env.SOUL_FILE;
  if (envPath) {
    candidates.push(path.resolve(envPath));
  }

  // 2. Local workspace directory
  const cwd = process.cwd();
  candidates.push(path.join(cwd, "SOUL.md"));
  candidates.push(path.join(cwd, "soul.md"));

  // 3. Global configuration directories
  const home = os.homedir();
  candidates.push(path.join(home, ".alphaway", "SOUL.md"));
  candidates.push(path.join(home, ".alphaway", "soul.md"));

  return candidates;
}

/**
 * Reads a file with mtime caching for instant hot-reload without CPU overhead.
 */
function readFileWithCache(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;

    const cached = fileCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.content;
    }

    const content = fs.readFileSync(filePath, "utf8");
    fileCache.set(filePath, { mtimeMs: stat.mtimeMs, content });
    return content;
  } catch {
    return null;
  }
}

/**
 * Resolves active SOUL specification based on configuration and filesystem.
 */
export function resolveSoulInfo(config?: {
  soulEnabled?: boolean;
  soulMode?: "auto" | "preset" | "custom";
  soulPreset?: string;
  soulFilePath?: string;
  soulCustomContent?: string;
}): SoulInfo {
  const isExplicitDisabled = config?.soulEnabled === false;
  const mode = config?.soulMode || "auto";
  const requestedPreset = config?.soulPreset || "atlas";

  // If user selected custom inline content
  if (mode === "custom" && config?.soulCustomContent) {
    const content = config.soulCustomContent.trim();
    return {
      enabled: !isExplicitDisabled,
      source: "custom_content",
      filePath: null,
      content,
      preset: "custom",
      tokenEstimate: estimateTokens(content),
    };
  }

  // If user selected a specific preset explicitly
  if (mode === "preset") {
    let content = ATLAS_SOUL;
    if (requestedPreset === "minimalist") content = MINIMALIST_SOUL;
    if (requestedPreset === "socratic") content = SOCRATIC_SOUL;

    return {
      enabled: !isExplicitDisabled,
      source: "preset",
      filePath: null,
      content,
      preset: requestedPreset,
      tokenEstimate: estimateTokens(content),
    };
  }

  // Auto-discovery mode: scan candidate paths
  const candidates = getCandidatePaths(config?.soulFilePath);
  for (const candidate of candidates) {
    const fileContent = readFileWithCache(candidate);
    if (fileContent && fileContent.trim().length > 0) {
      const isWorkspace = candidate.startsWith(process.cwd());
      const isCustom = config?.soulFilePath || process.env.SOUL_FILE;
      const source = isCustom && candidate.includes(String(isCustom))
        ? "custom_path"
        : isWorkspace
        ? "workspace"
        : "global";

      return {
        enabled: !isExplicitDisabled,
        source,
        filePath: candidate,
        content: fileContent.trim(),
        preset: "file",
        tokenEstimate: estimateTokens(fileContent),
      };
    }
  }

  // Default fallback if no file is found: Atlas preset
  return {
    enabled: !isExplicitDisabled,
    source: "preset",
    filePath: null,
    content: ATLAS_SOUL,
    preset: "atlas",
    tokenEstimate: estimateTokens(ATLAS_SOUL),
  };
}

/**
 * Wraps SOUL markdown into SoulSpec demarcation tags for model prompt injection.
 */
export function formatSoulPrompt(soulContent: string): string {
  if (!soulContent || typeof soulContent !== "string") return "";
  const trimmed = soulContent.trim();
  if (!trimmed) return "";

  return `<agent_soul_specification>\n# AGENT SOUL PROTOCOL\n${trimmed}\n</agent_soul_specification>`;
}

/**
 * Rough token estimator (1 token ≈ 4 characters of English text).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Saves content to a SOUL.md file on disk.
 */
export function saveSoulFile(targetPath: string, content: string): { ok: boolean; error?: string } {
  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, content, "utf8");
    fileCache.delete(targetPath); // invalidate cache
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
