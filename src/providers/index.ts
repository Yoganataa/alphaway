/**
 * Provider Manager & Registry
 * Unifies OpenCode Free-Tier, CodeBuddy International, and 3rd-Party Custom providers.
 */

import * as opencode from "./opencode";
import * as codebuddy from "./codebuddy";
import { findCustomProviderForModel, loadCustomProviders } from "../core/custom-providers";
import type { ModelInfo, ChatCompletionRequest } from "../types";

export { opencode, codebuddy };

export type ProviderType = "opencode" | "codebuddy" | "custom";

export function resolveProvider(model: string): ProviderType {
  if (codebuddy.isCodebuddyModel(model)) {
    return "codebuddy";
  }
  if (findCustomProviderForModel(model)) {
    return "custom";
  }
  return "opencode";
}

export async function getAllModels(): Promise<ModelInfo[]> {
  const [opencodeModels] = await Promise.all([
    opencode.discoverModels(),
  ]);

  const cbModels: ModelInfo[] = codebuddy.CODEBUDDY_MODELS.map((item: any) => {
    const id = typeof item === "string" ? item : item.id;
    return {
      id,
      object: "model" as const,
      created: Math.floor(Date.now() / 1000),
      owned_by: "codebuddy",
      permission: [],
      root: id,
      parent: null,
    };
  });

  const customProviders = loadCustomProviders().filter((p) => p.enabled);
  const customModels: ModelInfo[] = [];
  for (const p of customProviders) {
    for (const m of p.models) {
      const modelId = m.includes("/") ? m : `${p.id}/${m}`;
      customModels.push({
        id: modelId,
        object: "model" as const,
        created: Math.floor(Date.now() / 1000),
        owned_by: p.id,
        permission: [],
        root: modelId,
        parent: null,
      });
    }
  }

  return [...opencodeModels, ...cbModels, ...customModels];
}
