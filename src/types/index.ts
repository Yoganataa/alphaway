/**
 * Comprehensive Core Type Definitions for AlphaWay.
 * High-performance, type-safe API Gateway contracts.
 */

export type Role = "system" | "user" | "assistant" | "tool" | "developer";

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: ToolCallFunction;
}

export interface ChatMessage {
  role: Role;
  content: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  tools?: any[];
  tool_choice?: any;
  reasoning_effort?: "low" | "medium" | "high";
  session_id?: string;
  [key: string]: any;
}

export interface ChatCompletionChoiceDelta {
  role?: Role;
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: ToolCall[];
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: ChatCompletionChoiceDelta;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | null;
      reasoning_content?: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ModelInfo {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  provider: "opencode" | "codebuddy" | "custom";
  name?: string;
}

export interface TokenSaverConfig {
  rtkEnabled: boolean;
  rtkMaxLines: number;
  rtkDeduplicate: boolean;
  cavemanEnabled: boolean;
  cavemanLevel: "lite" | "full" | "ultra";
  cavemanLang: "auto" | "id" | "en";
  cavemanAutoClarity: boolean;
  adhdEnabled: boolean;
  adhdLevel: "lite" | "full";
}

export interface EgressProxyEntry {
  url: string;
  direct?: boolean;
  label?: string;
}

export interface EgressProxyState {
  mode: "direct" | "proxy" | "pool";
  proxy?: string;
  pool?: {
    active: boolean;
    entries: string[];
    strategy: "round-robin" | "failover";
  };
  relayUrl?: string;
}

export interface GateAnchors {
  requiredToolName: string; // "read"
  userAgentShape: string;
  sessionHeaderShape: string;
  envBlockShape: string;
}

export interface OpenCodeIdentityState {
  version: string;
  userAgent: string;
  lastChecked: number;
  lastTtlMs: number;
}
