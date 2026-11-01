/**
 * Token budgeting for reasoning and non-reasoning models (TypeScript).
 *
 * Reasoning models emit chain-of-thought tokens counting against the same budget.
 * We apply the additive formula: max(requested, 1024) + 4096 so short client requests
 * never get truncated or return empty responses.
 */

export const MIN_ANSWER_TOKENS = 1024;
export const THINKING_BUDGET = 4096;
export const MAX_OUTPUT_TOKENS = 131072;
export const MIN_PLAIN_TOKENS = 512;

export const REASONING_MODEL_HINTS: readonly string[] = Object.freeze([]);

export function isReasoningModel(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  if (!id) return false;
  try {
    const facts = require("./identity").getModelFacts(id);
    if (facts && typeof facts.reasoning === "boolean") return facts.reasoning;
  } catch {
    // identity unavailable: fallback
  }
  return false;
}

export function isReasoningRequest(body: any, modelId: string): boolean {
  if (isReasoningModel(modelId)) return true;
  const effort = body && body.reasoning_effort;
  return Boolean(effort) && effort !== "none";
}

export function parseRequestedTokens(requested: any): number {
  if (requested === undefined || requested === null || typeof requested === "boolean") {
    return MAX_OUTPUT_TOKENS;
  }
  if (typeof requested === "string" && requested.trim() === "") {
    return MAX_OUTPUT_TOKENS;
  }
  const raw = Number(requested);
  if (!Number.isFinite(raw) || raw < 0) {
    return MAX_OUTPUT_TOKENS;
  }
  return Math.floor(raw);
}

export function effectiveMaxTokens(requested: any, modelId: string, body?: any): number {
  const wanted = parseRequestedTokens(requested);

  const effective = isReasoningRequest(body, modelId)
    ? Math.max(wanted, MIN_ANSWER_TOKENS) + THINKING_BUDGET
    : Math.max(wanted, MIN_PLAIN_TOKENS);

  let ceiling = MAX_OUTPUT_TOKENS;
  try {
    const facts = require("./identity").getModelFacts(modelId);
    if (facts && facts.maxOutput > 0) ceiling = Math.min(ceiling, facts.maxOutput);
  } catch {}
  return Math.min(effective, ceiling);
}
