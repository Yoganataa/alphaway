import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import * as identity from "../src/core/identity";
import {
  MIN_ANSWER_TOKENS,
  THINKING_BUDGET,
  MAX_OUTPUT_TOKENS,
  MIN_PLAIN_TOKENS,
  isReasoningModel,
  isReasoningRequest,
  effectiveMaxTokens,
  parseRequestedTokens,
} from "../src/core/token-budget";

describe("token-budget", () => {
  beforeEach(() => {
    identity.__reset();
    identity.applyRecipe({
      modelFacts: {
        "muse-spark-1.3-contributor-free": { reasoning: true, maxOutput: 131072 },
        "muse-spark-1.2-contributor-free": { reasoning: true, maxOutput: 131072 },
        "mimo-v2.6-flash-free": { reasoning: true, maxOutput: 32000 },
        "nemotron-3.5-lightning-free": { reasoning: true, maxOutput: 262144 },
        "longcat-2.5-preview-free": { reasoning: true, maxOutput: 131072 },
        "cat-jam-free": { reasoning: true, maxOutput: 131072 },
        "big-pickle": { reasoning: true, maxOutput: 32000 },
        "step-5-preview-free": { reasoning: true, maxOutput: 65536 },
        "deepseek-v4.1-flash-free": { reasoning: true, maxOutput: 32000 },
        "space-bunny-free": { reasoning: false, maxOutput: 131072 },
      },
    });
  });
  afterEach(() => {
    identity.__reset();
  });

  it("recognizes reasoning and non-reasoning models from catalog facts", () => {
    const reasoningModels = [
      "muse-spark-1.3-contributor-free",
      "muse-spark-1.2-contributor-free",
      "mimo-v2.6-flash-free",
      "nemotron-3.5-lightning-free",
      "longcat-2.5-preview-free",
      "cat-jam-free",
      "big-pickle",
      "step-5-preview-free",
      "deepseek-v4.1-flash-free",
    ];
    for (const model of reasoningModels) {
      expect(isReasoningModel(model)).toBe(true);
    }

    const nonReasoningModels = [
      "space-bunny-free",
      "unknown-model",
      "gpt-4o",
      "",
    ];
    for (const model of nonReasoningModels) {
      expect(isReasoningModel(model)).toBe(false);
    }
  });

  it("applies additive formula max(requested, 1024) + 4096 for reasoning models", () => {
    expect(effectiveMaxTokens(100, "big-pickle")).toBe(1024 + 4096);
    expect(effectiveMaxTokens(1024, "big-pickle")).toBe(1024 + 4096);
    expect(effectiveMaxTokens(2000, "big-pickle")).toBe(2000 + 4096);
    expect(effectiveMaxTokens(8000, "big-pickle")).toBe(8000 + 4096);
  });

  it("applies plain floor max(requested, 512) for non-reasoning models unless reasoning_effort is set", () => {
    expect(effectiveMaxTokens(100, "space-bunny-free")).toBe(512);
    expect(effectiveMaxTokens(512, "space-bunny-free")).toBe(512);
    expect(effectiveMaxTokens(2000, "space-bunny-free")).toBe(2000);

    expect(
      effectiveMaxTokens(100, "space-bunny-free", { reasoning_effort: "low" })
    ).toBe(1024 + 4096);
    expect(
      effectiveMaxTokens(100, "space-bunny-free", { reasoning_effort: "none" })
    ).toBe(512);
  });

  it("handles max_tokens: 0 and numeric strings without jumping to 131072 or returning strings", () => {
    expect(effectiveMaxTokens(0, "big-pickle")).toBe(1024 + 4096);
    expect(effectiveMaxTokens(0, "space-bunny-free")).toBe(512);
    expect(effectiveMaxTokens("2048", "space-bunny-free")).toBe(2048);
  });

  it("defaults missing/invalid budgets to MAX_OUTPUT_TOKENS and clamps oversized budgets", () => {
    expect(effectiveMaxTokens(undefined, "space-bunny-free", {})).toBe(MAX_OUTPUT_TOKENS);
    expect(effectiveMaxTokens(null, "muse-spark-1.3-contributor-free", {})).toBe(MAX_OUTPUT_TOKENS);
    expect(effectiveMaxTokens("", "space-bunny-free", {})).toBe(MAX_OUTPUT_TOKENS);
    expect(effectiveMaxTokens(-10, "space-bunny-free", {})).toBe(MAX_OUTPUT_TOKENS);
    expect(effectiveMaxTokens("not-a-number", "space-bunny-free", {})).toBe(MAX_OUTPUT_TOKENS);
    expect(effectiveMaxTokens(999999, "muse-spark-1.3-contributor-free", {})).toBe(MAX_OUTPUT_TOKENS);
  });

  it("parses requested tokens correctly", () => {
    expect(parseRequestedTokens(100)).toBe(100);
    expect(parseRequestedTokens("200")).toBe(200);
    expect(parseRequestedTokens(null)).toBe(131072);
    expect(parseRequestedTokens(-5)).toBe(131072);
  });
});
