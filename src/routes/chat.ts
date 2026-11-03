/**
 * Unified Multi-Protocol Chat Route
 *
 * Supports 3 Inbound Client Protocols:
 * 1. OpenAI Chat Completions API (/v1/chat/completions, /chat/completions)
 * 2. Anthropic Claude Messages API (/v1/messages, /messages)
 * 3. OpenAI Codex Responses API (/v1/responses, /responses, /response, /v1/response)
 *
 * Dispatches to:
 * - 3rd-Party Custom Providers (OpenRouter, DeepSeek, Anthropic, Ollama, etc.)
 * - CodeBuddy International Free-Tier Models
 * - OpenCode Free-Tier Models
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { readJsonRequestBody } from "../core/admin-guard";
import { releaseWhenBodyConsumed } from "../core/response-lifecycle";

import type { ChatCompletionRequest } from "../types";
import { codebuddy, opencode } from "../providers";
import {
  anthropicToOpenAI,
  responsesToOpenAI,
  openAIToAnthropicResponse,
  openAIToResponsesResponse,
  anthropicStreamFrames,
  responsesStreamFrames,
  type AnthropicRequest,
  type ResponsesRequest,
} from "../core/protocol-translator";
import { findCustomProviderForModel, forwardToCustomProvider } from "../core/custom-providers";
import { embeddedProviderUrlSecrets, redactCredentialEchoes } from "../core/provider-url-secrets";
const identity = require("../core/identity");
import * as tokensaver from "../features/tokensaver";
import { recordRequestUsage, estimateTokensFromText } from "../core/usage-tracker";
import { getCodeBuddyApiKey } from "../core/codebuddy-credentials";
import { isModelAllowedByPolicy, type EffectivePolicy } from "../core/policy";
import { acquireManagedKeyRequest, type PolicyGateResult } from "../core/rate-limiter";
import { inspectSecurityMessages } from "../core/security-rules";

function recordGatewayUsage(c: any, entry: Parameters<typeof recordRequestUsage>[0]) {
  const policyRejected = Boolean(c.get("policyRejected"));
  const recorded = recordRequestUsage({
    ...entry,
    clientApiKeyId: c.get("managedApiKeyId") ?? null,
    ...(policyRejected ? { promptTokens: 0, completionTokens: 0, savedTokens: 0 } : {}),
  });
  const settleQuota = c.get("settlePolicyQuota") as ((actualTokens: number, authoritative?: boolean) => void) | undefined;
  settleQuota?.(recorded.totalTokens, true);
  return recorded;
}


function blockSecurityRuleRequest(
  c: any,
  protocol: GatewayProtocol,
  model: string,
  provider: "opencode" | "codebuddy" | "custom",
  isStream: boolean,
  startedAt: number,
  rule: { id: string; description: string },
): Response {
  const message = `Request blocked by Security Rule '${rule.id}'. ${rule.description || "The configured security policy denied this content."}`;
  recordGatewayUsage(c, {
    protocol,
    model,
    provider,
    status: 403,
    latencyMs: Date.now() - startedAt,
    promptTokens: 0,
    completionTokens: 0,
    savedTokens: 0,
    stream: isStream,
  });

  if (protocol === "anthropic") {
    return c.json({
      type: "error",
      error: { type: "permission_error", code: "security_rule_blocked", message },
    }, 403);
  }
  return c.json({
    error: { type: "permission_error", code: "security_rule_blocked", message },
  }, 403);
}

function inspectOutboundMessages(
  c: any,
  messages: any[],
  protocol: GatewayProtocol,
  model: string,
  provider: "opencode" | "codebuddy" | "custom",
  isStream: boolean,
  startedAt: number,
): { messages: any[]; response: Response | null } {
  const result = inspectSecurityMessages(messages);
  if (result.blocked) {
    return {
      messages,
      response: blockSecurityRuleRequest(c, protocol, model, provider, isStream, startedAt, result.blocked),
    };
  }
  return { messages: result.messages, response: null };
}

function estimateTokensFromCharacterCount(characters: number): number {
  return characters > 0 ? Math.max(1, Math.ceil(characters / 3.8)) : 0;
}

function isNonNegativeTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function extractOpenAICompletionText(message: any): string {
  if (!message || typeof message !== "object" || Array.isArray(message)) return "";
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && value.length > 0) parts.push(value);
  };

  add(message.content);
  if (Array.isArray(message.content)) {
    for (const part of message.content) add(part?.text);
  }
  add(message.reasoning_content);
  add(message.refusal);
  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      add(toolCall?.function?.name);
      add(toolCall?.function?.arguments);
    }
  }
  add(message.function_call?.name);
  add(message.function_call?.arguments);
  return parts.join(" ");
}

/**
 * Resolve non-streaming OpenAI-style usage without inventing provider metrics.
 * Valid provider values, including zero, are authoritative. Missing or invalid
 * fields fall back to AlphaWay's text estimator, including tool-call payloads.
 */
export function resolveOpenAIResponseUsage(
  response: any,
  promptTokenFallback: number,
): { promptTokens: number; completionTokens: number } {
  const providerUsage = response?.usage;
  const message = response?.choices?.[0]?.message;
  const promptFallback = isNonNegativeTokenCount(promptTokenFallback) ? promptTokenFallback : 0;
  return {
    promptTokens: isNonNegativeTokenCount(providerUsage?.prompt_tokens)
      ? providerUsage.prompt_tokens
      : promptFallback,
    completionTokens: isNonNegativeTokenCount(providerUsage?.completion_tokens)
      ? providerUsage.completion_tokens
      : estimateTokensFromText(extractOpenAICompletionText(message)),
  };
}

function computePromptChars(messages: any[]): number {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((acc, m) => {
    if (typeof m?.content === "string") return acc + m.content.length;
    if (Array.isArray(m?.content)) {
      return acc + m.content.reduce((sum: number, part: any) => sum + (part?.text?.length || 0), 0);
    }
    return acc;
  }, 0);
}

function hasUnmeteredPromptContent(messages: any[]): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((message) => {
    const content = message?.content;
    if (Array.isArray(content)) {
      return content.some((part: any) =>
        !part || typeof part !== "object" || part.type !== "text" || typeof part.text !== "string"
      );
    }
    return content !== null && typeof content === "object";
  });
}

export const chatRoute = new Hono();

type GatewayProtocol = "openai" | "anthropic" | "responses";

function policyRejection(c: any, protocol: GatewayProtocol, status: number, code: string, message: string, retryAfter?: number): Response {
  c.set("policyRejected", true);
  if (retryAfter !== undefined) c.header("Retry-After", String(retryAfter));
  if (protocol === "anthropic") {
    return c.json({ type: "error", error: { type: status === 403 ? "permission_error" : status === 503 ? "api_error" : "rate_limit_error", code, message } }, status);
  }
  return c.json({ error: { message, type: status === 403 ? "permission_error" : status === 503 ? "server_error" : "rate_limit_error", param: status === 403 ? "model" : null, code } }, status);
}

/** Apply managed-key model/rate/concurrency policy before the upstream request. */
async function dispatchWithPolicy(
  c: any,
  rawReq: Request,
  body: ChatCompletionRequest,
  targetModel: string,
  isStream: boolean,
  promptTokens: number,
  protocol: GatewayProtocol,
  provider: "opencode" | "codebuddy" | "custom",
  signal?: AbortSignal,
): Promise<Response> {
  const startedAt = Date.now();
  const policy = c.get("effectivePolicy") as EffectivePolicy | null;
  if (!policy) return dispatchToUpstream(rawReq, body, targetModel, isStream, signal);

  if (!isModelAllowedByPolicy(policy, targetModel)) {
    return policyRejection(c, protocol, 403, "model_not_allowed", "The requested model is not allowed by this API key's effective policy.");
  }

  if ((policy.tpmLimit > 0 || policy.tokenQuota > 0) && hasUnmeteredPromptContent(body.messages)) {
    c.set("policyRejected", true);
    const message = "This API key has a prompt TPM limit or token quota, but the request contains non-text input that AlphaWay cannot meter safely. Use a key without these limits or send text-only input.";
    if (protocol === "anthropic") {
      return c.json({ type: "error", error: { type: "invalid_request_error", code: "multimodal_prompt_unmeterable", message } }, 400);
    }
    return c.json({
      error: {
        message,
        type: "invalid_request_error",
        param: protocol === "responses" ? "input" : "messages",
        code: "multimodal_prompt_unmeterable",
      },
    }, 400);
  }

  let dispatchBody = body;
  let quotaReservationTokens = promptTokens;
  if (policy.tokenQuota > 0) {
    const remaining = Math.max(0, policy.tokenQuota - policy.totalTokensUsed);
    const completionBudget = remaining - promptTokens;
    if (remaining <= 0 || completionBudget <= 0) {
      return policyRejection(c, protocol, 429, "token_quota_exceeded", "The API key token quota has been exhausted or cannot cover this prompt and a completion.");
    }
    const requestedOutput = Number(body.max_tokens);
    const boundedOutput = Number.isSafeInteger(requestedOutput) && requestedOutput > 0
      ? Math.min(requestedOutput, completionBudget)
      : completionBudget;
    dispatchBody = { ...body, max_tokens: boundedOutput };
    quotaReservationTokens = promptTokens + boundedOutput;
  }

  const gate: PolicyGateResult = acquireManagedKeyRequest(policy.keyId, policy, promptTokens, Date.now(), quotaReservationTokens);
  if (!gate.allowed) {
    const status = gate.status || 429;
    const axis = gate.axis || "rpm";
    const code = axis === "capacity" ? "policy_capacity_exceeded" : axis === "token_quota" ? "token_quota_exceeded" : "rate_limit_exceeded";
    const message = axis === "capacity"
      ? "The gateway policy limiter is at capacity. Retry this request shortly."
      : axis === "concurrency"
      ? "The API key concurrency limit has been reached."
      : axis === "tpm"
      ? "The API key prompt tokens-per-minute limit has been reached."
      : axis === "token_quota"
      ? "The API key token quota is reserved by other in-flight requests."
      : "The API key requests-per-minute limit has been reached.";
    return policyRejection(c, protocol, status, code, message, gate.retryAfterSeconds);
  }

  c.set("settlePolicyQuota", gate.settleQuota);
  try {
    const response = await dispatchToUpstream(rawReq, dispatchBody, targetModel, isStream, signal);
    return releaseWhenBodyConsumed(response, gate.release, () => gate.settleQuota(promptTokens, false));
  } catch (error) {
    gate.release();
    gate.settleQuota(0, true);
    try {
      recordGatewayUsage(c, {
        protocol,
        model: targetModel,
        provider,
        status: 502,
        latencyMs: Date.now() - startedAt,
        promptTokens: 0,
        completionTokens: 0,
        savedTokens: 0,
        stream: isStream,
      });
    } catch {}
    throw error;
  }
}


/**
 * Core Dispatcher: Executes chat completions across OpenCode, CodeBuddy, or Custom Providers.
 * Always returns a standard Response with OpenAI JSON (if non-stream) or OpenAI SSE stream (if stream).
 */
async function dispatchToUpstream(
  rawReq: Request,
  body: ChatCompletionRequest,
  targetModel: string,
  isStream: boolean,
  signal?: AbortSignal
): Promise<Response> {
  // 1. Check for 3rd-Party Custom Provider
  const customMatch = findCustomProviderForModel(targetModel);
  if (customMatch) {
    const upstreamRes = await forwardToCustomProvider(
      customMatch.provider,
      customMatch.actualModel,
      {
        messages: body.messages,
        stream: isStream,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
      }
    );

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      const providerSecret = String(customMatch.provider.apiKey || "");
      const providerSecrets = [providerSecret, ...embeddedProviderUrlSecrets(customMatch.provider.baseUrl)];
      const safeError = redactCredentialEchoes(errText, providerSecrets, 3000);
      return new Response(safeError, {
        status: upstreamRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!isStream) {
      const json = await upstreamRes.json();
      // If upstream custom provider was Anthropic, normalize to OpenAI JSON
      if (customMatch.provider.protocol === "anthropic") {
        const text = json.content?.[0]?.text || "";
        const sanitized = tokensaver.sanitizeInboundContent(text);
        const openAiFormat = {
          id: json.id || "chatcmpl-" + Math.random().toString(36).slice(2),
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: targetModel,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: sanitized },
              finish_reason: json.stop_reason === "max_tokens" ? "length" : "stop",
            },
          ],
          usage: json.usage && (
            Number.isFinite(json.usage.input_tokens) || Number.isFinite(json.usage.output_tokens)
          )
            ? {
                prompt_tokens: Number.isFinite(json.usage.input_tokens) ? json.usage.input_tokens : undefined,
                completion_tokens: Number.isFinite(json.usage.output_tokens) ? json.usage.output_tokens : undefined,
                total_tokens: (Number.isFinite(json.usage.input_tokens) ? json.usage.input_tokens : 0)
                  + (Number.isFinite(json.usage.output_tokens) ? json.usage.output_tokens : 0),
              }
            : undefined,
        };
        return Response.json(openAiFormat);
      } else {
        if (json.choices?.[0]?.message?.content) {
          json.choices[0].message.content = tokensaver.sanitizeInboundContent(json.choices[0].message.content);
        }
        return Response.json(json);
      }
    } else {
      // Streaming from custom provider
      if (customMatch.provider.protocol === "anthropic") {
        // Translate Anthropic SSE to OpenAI SSE stream
        const reader = upstreamRes.body?.getReader();
        if (!reader) return upstreamRes;
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
          async start(controller) {
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed.startsWith("data: ")) {
                    const dataStr = trimmed.slice(6);
                    try {
                      const parsed = JSON.parse(dataStr);
                      if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                        const sanitized = tokensaver.sanitizeInboundContent(parsed.delta.text);
                        const openAiChunk = {
                          id: "chatcmpl-" + Math.random().toString(36).slice(2),
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model: targetModel,
                          choices: [{ index: 0, delta: { content: sanitized }, finish_reason: null }],
                        };
                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAiChunk)}\n\n`));
                      }
                    } catch {}
                  }
                }
              }
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            } finally {
              reader.releaseLock();
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      } else {
        // OpenAI custom provider pass-through with sanitization
        const reader = upstreamRes.body?.getReader();
        if (!reader) return upstreamRes;
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
          async start(controller) {
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    let data = line.slice(6).trim();
                    if (data && data !== "[DONE]") {
                      try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices?.[0]?.delta?.content) {
                          parsed.choices[0].delta.content = tokensaver.sanitizeInboundContent(
                            parsed.choices[0].delta.content
                          );
                          data = JSON.stringify(parsed);
                        }
                      } catch {}
                    }
                    controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
                  }
                }
              }
            } finally {
              reader.releaseLock();
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
    }
  }

  // 2. Dispatch to CodeBuddy
  const isCodebuddy = codebuddy.isCodebuddyModel(targetModel);
  if (isCodebuddy) {
    // AlphaWay gateway credentials are authenticated by app middleware and must
    // never be reused as upstream CodeBuddy credentials.
    const apiKey = getCodeBuddyApiKey() || rawReq.headers.get("x-codebuddy-api-key") || "";

    if (!apiKey) {
      return Response.json(
        {
          error: {
            message: "CodeBuddy authentication required. Run OAuth login or provide CODEBUDDY_API_KEY.",
            type: "authentication_error",
            code: "codebuddy_auth_required",
          },
        },
        { status: 401 }
      );
    }

    let releaseSlot: (() => void) | null = null;
    try {
      releaseSlot = await codebuddy.acquireInFlightSlot(signal);
    } catch {
      return Response.json({ error: { message: "Request cancelled waiting for slot", type: "cancelled" } }, { status: 499 });
    }

    try {
      const upstreamBody = codebuddy.transformCodebuddyBody(body, targetModel);
      const upstreamHeaders = codebuddy.buildCodebuddyHeaders({
        model: targetModel,
        apiKey,
      });

      const targetUrl = process.env.CODEBUDDY_INTL_URL || codebuddy.CODEBUDDY_INTL_URL;
      const upstreamRes = await fetch(targetUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(upstreamBody),
        signal,
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text();
        let errJson: any = null;
        try { errJson = JSON.parse(errText); } catch {}
        const targetUrl = process.env.CODEBUDDY_INTL_URL || codebuddy.CODEBUDDY_INTL_URL;
        const upstreamSecrets = [apiKey, ...embeddedProviderUrlSecrets(targetUrl)];
        const safeErrorText = redactCredentialEchoes(errText, upstreamSecrets, 3000);
        if (errJson && errJson.code) {
          const classified = codebuddy.classifyCodebuddyError(upstreamRes.status, errJson);
          const safeClassified = JSON.parse(redactCredentialEchoes(JSON.stringify(classified), upstreamSecrets, 3000));
          return Response.json({ error: safeClassified }, { status: safeClassified.status as any });
        }
        return new Response(safeErrorText, { status: upstreamRes.status, headers: { "Content-Type": "application/json" } });
      }

      if (isStream) {
        const reader = upstreamRes.body?.getReader();
        if (!reader) return upstreamRes;
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
          async start(controller) {
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    let data = line.slice(6).trim();
                    if (data && data !== "[DONE]") {
                      try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices?.[0]?.delta?.content) {
                          parsed.choices[0].delta.content = tokensaver.sanitizeInboundContent(
                            parsed.choices[0].delta.content
                          );
                          data = JSON.stringify(parsed);
                        }
                      } catch {}
                    }
                    controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
                  }
                }
              }
            } finally {
              reader.releaseLock();
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      } else {
        const text = await upstreamRes.text();
        const json = codebuddy.sseToOpenAIJson(text, targetModel);
        if (json.choices?.[0]?.message?.content) {
          json.choices[0].message.content = tokensaver.sanitizeInboundContent(json.choices[0].message.content);
        }
        return Response.json(json);
      }
    } finally {
      if (releaseSlot) releaseSlot();
    }
  }

  // 3. Dispatch to OpenCode Free Tier
  return opencode.handleOpenCodeChat(rawReq, body, targetModel, isStream, signal);
}


export function trackOpenAIStreamingUsage(
  response: Response,
  usage: {
    clientApiKeyId: string | null;
    model: string;
    provider: "opencode" | "codebuddy" | "custom";
    startedAt: number;
    promptTokens: number;
    savedTokens: number;
    settleQuota?: (actualTokens: number, authoritative?: boolean) => void;
  },
): Response {
  const source = response.body;
  let completionCharacters = 0;
  let reportedPromptTokens: number | null = null;
  let reportedCompletionTokens: number | null = null;
  let buffer = "";
  let finalized = false;
  const decoder = new TextDecoder();

  const addCompletionText = (value: unknown) => {
    if (typeof value === "string") completionCharacters += value.length;
  };

  const isTokenCount = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const event = JSON.parse(payload);
      const providerUsage = event?.usage;
      if (providerUsage && typeof providerUsage === "object") {
        if (isTokenCount(providerUsage.prompt_tokens)) reportedPromptTokens = providerUsage.prompt_tokens;
        if (isTokenCount(providerUsage.completion_tokens)) reportedCompletionTokens = providerUsage.completion_tokens;
      }

      const delta = event?.choices?.[0]?.delta;
      if (!delta || typeof delta !== "object") return;

      const content = delta.content;
      if (typeof content === "string") addCompletionText(content);
      else if (Array.isArray(content)) {
        for (const part of content) addCompletionText(part?.text);
      }

      // Function/tool arguments are generated completion tokens too, even when
      // the stream contains no assistant message content.
      if (Array.isArray(delta.tool_calls)) {
        for (const toolCall of delta.tool_calls) {
          addCompletionText(toolCall?.function?.name);
          addCompletionText(toolCall?.function?.arguments);
        }
      }
      // Retain compatibility with the legacy Chat Completions function_call shape.
      addCompletionText(delta.function_call?.name);
      addCompletionText(delta.function_call?.arguments);
    } catch {}
  };

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    const recorded = recordRequestUsage({
      clientApiKeyId: usage.clientApiKeyId,
      protocol: "openai",
      model: usage.model,
      provider: usage.provider,
      status: response.status,
      latencyMs: Date.now() - usage.startedAt,
      promptTokens: reportedPromptTokens ?? usage.promptTokens,
      completionTokens: reportedCompletionTokens ?? estimateTokensFromCharacterCount(completionCharacters),
      savedTokens: usage.savedTokens,
      stream: true,
    });
    usage.settleQuota?.(recorded.totalTokens, true);
  };

  if (!source) {
    finalize();
    return response;
  }
  const reader = source.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          const tail = buffer + decoder.decode();
          if (tail) consumeLine(tail);
          controller.close();
          finalize();
          try { reader.releaseLock(); } catch {}
          return;
        }
        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) consumeLine(line);
        controller.enqueue(result.value);
      } catch (error) {
        controller.error(error);
        finalize();
        try { reader.releaseLock(); } catch {}
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finalize();
        try { reader.releaseLock(); } catch {}
      }
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

// ============================================================================
// 1. OpenAI Chat Completions Handler (/v1/chat/completions)
// ============================================================================

const handleOpenAIChat = async (c: any) => {
  let body: ChatCompletionRequest;
  try {
    body = await readJsonRequestBody(c.req);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object");
    }
  } catch (err: any) {
    const oversized = err?.statusCode === 413;
    return c.json({
      error: {
        message: oversized ? "Request body exceeds the 10 MiB limit" : `Invalid JSON body: ${err.message}`,
        type: "invalid_request_error",
        code: oversized ? "request_too_large" : "invalid_json",
      },
    }, oversized ? 413 : 400);
  }

  if (!body.model || typeof body.model !== "string") {
    return c.json({ error: { message: "Missing or empty required parameter: 'model'", type: "invalid_request_error", param: "model", code: "model_required" } }, 400);
  }

  if (!Array.isArray(body.messages)) {
    return c.json({ error: { message: "Missing or invalid required parameter: 'messages' must be an array", type: "invalid_request_error", param: "messages", code: "messages_required" } }, 400);
  }

  const startTime = Date.now();
  const rawModel = body.model;
  const isCodebuddy = codebuddy.isCodebuddyModel(rawModel);
  const isCustom = Boolean(findCustomProviderForModel(rawModel));
  const targetModel = isCodebuddy
    ? codebuddy.normalizeCodebuddyModel(rawModel)
    : isCustom
    ? rawModel
    : opencode.normalizeModel(rawModel);

  const providerType: "opencode" | "codebuddy" | "custom" = isCodebuddy
    ? "codebuddy"
    : isCustom
    ? "custom"
    : "opencode";

  if (!targetModel) {
    return c.json({ error: { message: "Missing or empty required parameter: 'model'", type: "invalid_request_error", param: "model", code: "model_required" } }, 400);
  }

  const security = inspectOutboundMessages(c, body.messages, "openai", targetModel, providerType, Boolean(body.stream), startTime);
  if (security.response) return security.response;
  body.messages = tokensaver.applyTokenSavers(security.messages, undefined, [rawModel, targetModel]);
  const injectedSecurity = inspectOutboundMessages(c, body.messages, "openai", targetModel, providerType, Boolean(body.stream), startTime);
  if (injectedSecurity.response) return injectedSecurity.response;
  body.messages = injectedSecurity.messages;
  const origChars = computePromptChars(security.messages);
  const newChars = computePromptChars(body.messages);
  const savedTokens = Math.max(0, estimateTokensFromText("x".repeat(Math.max(0, origChars - newChars))));
  const promptTokens = estimateTokensFromText("x".repeat(newChars));

  if (!isCodebuddy && !isCustom) {
    const modelVerdict = identity.getCatalogVerdict(targetModel);
    if (modelVerdict && modelVerdict !== "free") {
      const isRetired = modelVerdict === "deprecated";
      return c.json(
        {
          error: {
            message: isRetired
              ? `Model '${targetModel}' has been retired upstream. Free models are listed at /v1/models.`
              : `Model '${targetModel}' is not on the free tier, and this bridge has no account to run it with. Free models are listed at /v1/models.`,
            type: "invalid_request_error",
            param: "model",
            code: isRetired ? "model_deprecated" : "model_not_free",
          },
        },
        404
      );
    }
  }

  const isStream = Boolean(body.stream);
  const res = await dispatchWithPolicy(c, c.req.raw, body, targetModel, isStream, promptTokens, "openai", providerType, c.req.raw.signal);

  // Record Usage Telemetry
  if (!res.ok) {
    recordGatewayUsage(c, {
      clientApiKeyId: c.get("managedApiKeyId") ?? null,
      protocol: "openai",
      model: targetModel,
      provider: providerType,
      status: res.status,
      latencyMs: Date.now() - startTime,
      promptTokens,
      completionTokens: 0,
      savedTokens: 0,
      stream: isStream,
    });
  } else if (isStream) {
    return trackOpenAIStreamingUsage(res, {
      clientApiKeyId: c.get("managedApiKeyId") ?? null,
      model: targetModel,
      provider: providerType,
      startedAt: startTime,
      promptTokens,
      savedTokens,
      settleQuota: c.get("settlePolicyQuota"),
    });
  } else {
    try {
      const clone = res.clone();
      clone.json().then((json: any) => {
        const usage = resolveOpenAIResponseUsage(json, promptTokens);
        recordGatewayUsage(c, {
          clientApiKeyId: c.get("managedApiKeyId") ?? null,
          protocol: "openai",
          model: targetModel,
          provider: providerType,
          status: res.status,
          latencyMs: Date.now() - startTime,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          savedTokens,
          stream: false,
        });
      }).catch(() => {});
    } catch {}
  }

  return res;
};

// ============================================================================
// 2. Anthropic Claude Messages Handler (/v1/messages & /messages)
// ============================================================================

const handleAnthropicMessages = async (c: any) => {
  let body: AnthropicRequest;
  try {
    body = await readJsonRequestBody(c.req);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object");
    }
  } catch (err: any) {
    const oversized = err?.statusCode === 413;
    return c.json({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: oversized ? "Request body exceeds the 10 MiB limit" : `Invalid JSON body: ${err.message}`,
        code: oversized ? "request_too_large" : "invalid_json",
      },
    }, oversized ? 413 : 400);
  }

  if (!body.model || typeof body.model !== "string") {
    return c.json({ type: "error", error: { type: "invalid_request_error", message: "model is required" } }, 400);
  }

  if (!Array.isArray(body.messages)) {
    return c.json({ type: "error", error: { type: "invalid_request_error", message: "messages is required and must be an array" } }, 400);
  }

  const startTime = Date.now();

  // Convert Anthropic request to OpenAI Chat format
  const openAIBody = anthropicToOpenAI(body);
  const rawModel = openAIBody.model;
  const isCodebuddy = codebuddy.isCodebuddyModel(rawModel);
  const isCustom = Boolean(findCustomProviderForModel(rawModel));
  const targetModel = isCodebuddy
    ? codebuddy.normalizeCodebuddyModel(rawModel)
    : isCustom
    ? rawModel
    : opencode.normalizeModel(rawModel);

  const providerType: "opencode" | "codebuddy" | "custom" = isCodebuddy
    ? "codebuddy"
    : isCustom
    ? "custom"
    : "opencode";

  const isStream = Boolean(body.stream);
  const security = inspectOutboundMessages(c, openAIBody.messages, "anthropic", targetModel, providerType, isStream, startTime);
  if (security.response) return security.response;
  const origChars = computePromptChars(security.messages);
  openAIBody.messages = tokensaver.applyTokenSavers(security.messages, undefined, [rawModel, targetModel]);
  const injectedSecurity = inspectOutboundMessages(c, openAIBody.messages, "anthropic", targetModel, providerType, isStream, startTime);
  if (injectedSecurity.response) return injectedSecurity.response;
  openAIBody.messages = injectedSecurity.messages;
  const newChars = computePromptChars(openAIBody.messages);
  const savedTokens = Math.max(0, estimateTokensFromText("x".repeat(Math.max(0, origChars - newChars))));
  const promptTokens = estimateTokensFromText("x".repeat(newChars));

  const upstreamRes = await dispatchWithPolicy(c, c.req.raw, openAIBody as any, targetModel, isStream, promptTokens, "anthropic", providerType, c.req.raw.signal);

  if (!upstreamRes.ok) {
    recordGatewayUsage(c, {
      clientApiKeyId: c.get("managedApiKeyId") ?? null,
      protocol: "anthropic",
      model: targetModel,
      provider: providerType,
      status: upstreamRes.status,
      latencyMs: Date.now() - startTime,
      promptTokens,
      completionTokens: 0,
      savedTokens: 0,
      stream: isStream,
    });
    const text = await upstreamRes.text();
    return new Response(text, { status: upstreamRes.status, headers: { "Content-Type": "application/json" } });
  }

  if (!isStream) {
    const openAIJson = await upstreamRes.json();
    const anthropicJson = openAIToAnthropicResponse(openAIJson, targetModel);
    const usage = resolveOpenAIResponseUsage(openAIJson, promptTokens);
    // Replace legacy translator placeholders with provider usage or AlphaWay estimates.
    anthropicJson.usage = {
      input_tokens: usage.promptTokens,
      output_tokens: usage.completionTokens,
    };
    recordGatewayUsage(c, {
      clientApiKeyId: c.get("managedApiKeyId") ?? null,
      protocol: "anthropic",
      model: targetModel,
      provider: providerType,
      status: 200,
      latencyMs: Date.now() - startTime,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      savedTokens,
      stream: false,
    });
    return c.json(anthropicJson);
  } else {
    // Convert OpenAI SSE stream to Anthropic SSE stream and meter the actual text.
    const reader = upstreamRes.body?.getReader();
    if (!reader) {
      recordGatewayUsage(c, {
        clientApiKeyId: c.get("managedApiKeyId") ?? null,
        protocol: "anthropic",
        model: targetModel,
        provider: providerType,
        status: 200,
        latencyMs: Date.now() - startTime,
        promptTokens,
        completionTokens: 0,
        savedTokens,
        stream: true,
      });
      return upstreamRes;
    }
    const decoder = new TextDecoder();
    const frames = anthropicStreamFrames(targetModel);

    return streamSSE(c, async (stream) => {
      let started = false;
      let buffer = "";
      let completionCharacters = 0;
      let upstreamEnded = false;
      let usageFinalized = false;
      let upstreamCancelPromise: Promise<void> | null = null;

      const finalizeUsage = () => {
        if (usageFinalized) return;
        usageFinalized = true;
        recordGatewayUsage(c, {
          clientApiKeyId: c.get("managedApiKeyId") ?? null,
          protocol: "anthropic",
          model: targetModel,
          provider: providerType,
          status: 200,
          latencyMs: Date.now() - startTime,
          promptTokens,
          completionTokens: estimateTokensFromCharacterCount(completionCharacters),
          savedTokens,
          stream: true,
        });
      };
      const cancelUpstream = () => {
        if (!upstreamCancelPromise) {
          upstreamCancelPromise = reader.cancel("downstream client disconnected").then(() => {}).catch(() => {});
        }
        return upstreamCancelPromise;
      };

      stream.onAbort(() => {
        finalizeUsage();
        if (!upstreamEnded) void cancelUpstream();
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            upstreamEnded = true;
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6);
              if (dataStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(dataStr);
                const deltaContent = parsed.choices?.[0]?.delta?.content;
                if (deltaContent) {
                  if (!started) {
                    await stream.write(frames.start());
                    started = true;
                  }
                  completionCharacters += deltaContent.length;
                  await stream.write(frames.delta(deltaContent));
                }
              } catch {}
            }
          }
        }

        if (!started) {
          await stream.write(frames.start());
        }
        await stream.write(frames.end(estimateTokensFromCharacterCount(completionCharacters)));
      } finally {
        if (!upstreamEnded) await cancelUpstream();
        finalizeUsage();
        reader.releaseLock();
      }
    });
  }
};

// ============================================================================
// 3. OpenAI Responses Handler (/v1/responses, /responses, /response, /v1/response)
// ============================================================================

const handleResponses = async (c: any) => {
  let body: ResponsesRequest;
  try {
    body = await readJsonRequestBody(c.req);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object");
    }
  } catch (err: any) {
    const oversized = err?.statusCode === 413;
    return c.json({
      error: {
        message: oversized ? "Request body exceeds the 10 MiB limit" : `Invalid JSON body: ${err.message}`,
        type: "invalid_request_error",
        code: oversized ? "request_too_large" : "invalid_json",
      },
    }, oversized ? 413 : 400);
  }

  if (!body.model || typeof body.model !== "string") {
    return c.json({ error: { message: "model is required", type: "invalid_request_error", param: "model" } }, 400);
  }

  const startTime = Date.now();

  // Convert Responses request to OpenAI Chat format
  const openAIBody = responsesToOpenAI(body);
  const rawModel = openAIBody.model;
  const isCodebuddy = codebuddy.isCodebuddyModel(rawModel);
  const isCustom = Boolean(findCustomProviderForModel(rawModel));
  const targetModel = isCodebuddy
    ? codebuddy.normalizeCodebuddyModel(rawModel)
    : isCustom
    ? rawModel
    : opencode.normalizeModel(rawModel);

  const providerType: "opencode" | "codebuddy" | "custom" = isCodebuddy
    ? "codebuddy"
    : isCustom
    ? "custom"
    : "opencode";

  const isStream = Boolean(body.stream);
  const security = inspectOutboundMessages(c, openAIBody.messages, "responses", targetModel, providerType, isStream, startTime);
  if (security.response) return security.response;
  const origChars = computePromptChars(security.messages);
  openAIBody.messages = tokensaver.applyTokenSavers(security.messages, undefined, [rawModel, targetModel]);
  const injectedSecurity = inspectOutboundMessages(c, openAIBody.messages, "responses", targetModel, providerType, isStream, startTime);
  if (injectedSecurity.response) return injectedSecurity.response;
  openAIBody.messages = injectedSecurity.messages;
  const newChars = computePromptChars(openAIBody.messages);
  const savedTokens = Math.max(0, estimateTokensFromText("x".repeat(Math.max(0, origChars - newChars))));
  const promptTokens = estimateTokensFromText("x".repeat(newChars));

  const upstreamRes = await dispatchWithPolicy(c, c.req.raw, openAIBody as any, targetModel, isStream, promptTokens, "responses", providerType, c.req.raw.signal);

  if (!upstreamRes.ok) {
    recordGatewayUsage(c, {
      clientApiKeyId: c.get("managedApiKeyId") ?? null,
      protocol: "responses",
      model: targetModel,
      provider: providerType,
      status: upstreamRes.status,
      latencyMs: Date.now() - startTime,
      promptTokens,
      completionTokens: 0,
      savedTokens: 0,
      stream: isStream,
    });
    const text = await upstreamRes.text();
    return new Response(text, { status: upstreamRes.status, headers: { "Content-Type": "application/json" } });
  }

  if (!isStream) {
    const openAIJson = await upstreamRes.json();
    const responsesJson = openAIToResponsesResponse(openAIJson, targetModel);
    const usage = resolveOpenAIResponseUsage(openAIJson, promptTokens);
    // Replace legacy translator placeholders with provider usage or AlphaWay estimates.
    responsesJson.usage = {
      input_tokens: usage.promptTokens,
      output_tokens: usage.completionTokens,
      total_tokens: usage.promptTokens + usage.completionTokens,
    };
    recordGatewayUsage(c, {
      clientApiKeyId: c.get("managedApiKeyId") ?? null,
      protocol: "responses",
      model: targetModel,
      provider: providerType,
      status: 200,
      latencyMs: Date.now() - startTime,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      savedTokens,
      stream: false,
    });
    return c.json(responsesJson);
  } else {
    // Translate Responses SSE and meter actual emitted text.
    const reader = upstreamRes.body?.getReader();
    if (!reader) {
      recordGatewayUsage(c, {
        clientApiKeyId: c.get("managedApiKeyId") ?? null,
        protocol: "responses",
        model: targetModel,
        provider: providerType,
        status: 200,
        latencyMs: Date.now() - startTime,
        promptTokens,
        completionTokens: 0,
        savedTokens,
        stream: true,
      });
      return upstreamRes;
    }
    const decoder = new TextDecoder();
    const frames = responsesStreamFrames(targetModel);

    return streamSSE(c, async (stream) => {
      let buffer = "";
      let completionCharacters = 0;
      let upstreamEnded = false;
      let usageFinalized = false;
      let upstreamCancelPromise: Promise<void> | null = null;

      const finalizeUsage = () => {
        if (usageFinalized) return;
        usageFinalized = true;
        recordGatewayUsage(c, {
          clientApiKeyId: c.get("managedApiKeyId") ?? null,
          protocol: "responses",
          model: targetModel,
          provider: providerType,
          status: 200,
          latencyMs: Date.now() - startTime,
          promptTokens,
          completionTokens: estimateTokensFromCharacterCount(completionCharacters),
          savedTokens,
          stream: true,
        });
      };
      const cancelUpstream = () => {
        if (!upstreamCancelPromise) {
          upstreamCancelPromise = reader.cancel("downstream client disconnected").then(() => {}).catch(() => {});
        }
        return upstreamCancelPromise;
      };

      stream.onAbort(() => {
        finalizeUsage();
        if (!upstreamEnded) void cancelUpstream();
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            upstreamEnded = true;
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6);
              if (dataStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(dataStr);
                const deltaContent = parsed.choices?.[0]?.delta?.content;
                if (deltaContent) {
                  completionCharacters += deltaContent.length;
                  await stream.write(frames.delta(deltaContent));
                }
              } catch {}
            }
          }
        }
        await stream.write(frames.end(estimateTokensFromCharacterCount(completionCharacters)));
      } finally {
        if (!upstreamEnded) await cancelUpstream();
        finalizeUsage();
        reader.releaseLock();
      }
    });
  }
};

// ============================================================================
// Route Mounts
// ============================================================================

// 1. OpenAI Chat Completions API
chatRoute.post("/v1/chat/completions", handleOpenAIChat);
chatRoute.post("/chat/completions", handleOpenAIChat);
chatRoute.post("/api/chat", handleOpenAIChat);

// 2. Anthropic Claude Messages API
chatRoute.post("/v1/messages", handleAnthropicMessages);
chatRoute.post("/messages", handleAnthropicMessages);

// 3. OpenAI Responses API (Codex / Realtime Responses)
chatRoute.post("/v1/responses", handleResponses);
chatRoute.post("/responses", handleResponses);
chatRoute.post("/response", handleResponses);
chatRoute.post("/v1/response", handleResponses);
