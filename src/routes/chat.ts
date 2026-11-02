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

export const chatRoute = new Hono();

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
          usage: json.usage
            ? {
                prompt_tokens: json.usage.input_tokens || 10,
                completion_tokens: json.usage.output_tokens || 20,
                total_tokens: (json.usage.input_tokens || 10) + (json.usage.output_tokens || 20),
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

// ============================================================================
// 1. OpenAI Chat Completions Handler (/v1/chat/completions)
// ============================================================================

const handleOpenAIChat = async (c: any) => {
  let body: ChatCompletionRequest;
  try {
    body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object");
    }
  } catch (err: any) {
    return c.json({ error: { message: `Invalid JSON body: ${err.message}`, type: "invalid_request_error", code: "invalid_json" } }, 400);
  }

  if (!body.model || typeof body.model !== "string") {
    return c.json({ error: { message: "Missing or empty required parameter: 'model'", type: "invalid_request_error", param: "model", code: "model_required" } }, 400);
  }

  if (!Array.isArray(body.messages)) {
    return c.json({ error: { message: "Missing or invalid required parameter: 'messages' must be an array", type: "invalid_request_error", param: "messages", code: "messages_required" } }, 400);
  }

  const startTime = Date.now();
  const origChars = computePromptChars(body.messages);

  // Apply Outbound DLP & TokenSaver
  body.messages = tokensaver.applyTokenSavers(body.messages);
  const newChars = computePromptChars(body.messages);
  const savedTokens = Math.max(0, estimateTokensFromText("x".repeat(Math.max(0, origChars - newChars))));
  const promptTokens = estimateTokensFromText("x".repeat(newChars));

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
  const res = await dispatchToUpstream(c.req.raw, body, targetModel, isStream, c.req.raw.signal);

  // Record Usage Telemetry
  if (!res.ok) {
    recordRequestUsage({
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
    recordRequestUsage({
      protocol: "openai",
      model: targetModel,
      provider: providerType,
      status: res.status,
      latencyMs: Date.now() - startTime,
      promptTokens,
      completionTokens: 25,
      savedTokens,
      stream: true,
    });
  } else {
    try {
      const clone = res.clone();
      clone.json().then((json: any) => {
        const compTokens = json?.usage?.completion_tokens || estimateTokensFromText(json?.choices?.[0]?.message?.content || "");
        const actualPromptTokens = json?.usage?.prompt_tokens || promptTokens;
        recordRequestUsage({
          protocol: "openai",
          model: targetModel,
          provider: providerType,
          status: res.status,
          latencyMs: Date.now() - startTime,
          promptTokens: actualPromptTokens,
          completionTokens: compTokens,
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
    body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object");
    }
  } catch (err: any) {
    return c.json({ type: "error", error: { type: "invalid_request_error", message: `Invalid JSON body: ${err.message}` } }, 400);
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
  const origChars = computePromptChars(openAIBody.messages);

  // Apply Outbound DLP
  openAIBody.messages = tokensaver.applyTokenSavers(openAIBody.messages);
  const newChars = computePromptChars(openAIBody.messages);
  const savedTokens = Math.max(0, estimateTokensFromText("x".repeat(Math.max(0, origChars - newChars))));
  const promptTokens = estimateTokensFromText("x".repeat(newChars));

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
  const upstreamRes = await dispatchToUpstream(c.req.raw, openAIBody as any, targetModel, isStream, c.req.raw.signal);

  if (!upstreamRes.ok) {
    recordRequestUsage({
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
    recordRequestUsage({
      protocol: "anthropic",
      model: targetModel,
      provider: providerType,
      status: 200,
      latencyMs: Date.now() - startTime,
      promptTokens: anthropicJson.usage?.input_tokens || promptTokens,
      completionTokens: anthropicJson.usage?.output_tokens || 20,
      savedTokens,
      stream: false,
    });
    return c.json(anthropicJson);
  } else {
    recordRequestUsage({
      protocol: "anthropic",
      model: targetModel,
      provider: providerType,
      status: 200,
      latencyMs: Date.now() - startTime,
      promptTokens,
      completionTokens: 25,
      savedTokens,
      stream: true,
    });
    // Convert OpenAI SSE stream to Anthropic SSE stream
    const reader = upstreamRes.body?.getReader();
    if (!reader) return upstreamRes;
    const decoder = new TextDecoder();
    const frames = anthropicStreamFrames(targetModel);

    return streamSSE(c, async (stream) => {
      let started = false;
      let buffer = "";
      let tokenCount = 0;

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
              if (dataStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(dataStr);
                const deltaContent = parsed.choices?.[0]?.delta?.content;
                if (deltaContent) {
                  if (!started) {
                    await stream.write(frames.start());
                    started = true;
                  }
                  tokenCount++;
                  await stream.write(frames.delta(deltaContent));
                }
              } catch {}
            }
          }
        }

        if (!started) {
          await stream.write(frames.start());
        }
        await stream.write(frames.end(Math.max(tokenCount, 1)));
      } finally {
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
    body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object");
    }
  } catch (err: any) {
    return c.json({ error: { message: `Invalid JSON body: ${err.message}`, type: "invalid_request_error", code: "invalid_json" } }, 400);
  }

  if (!body.model || typeof body.model !== "string") {
    return c.json({ error: { message: "model is required", type: "invalid_request_error", param: "model" } }, 400);
  }

  const startTime = Date.now();

  // Convert Responses request to OpenAI Chat format
  const openAIBody = responsesToOpenAI(body);
  const origChars = computePromptChars(openAIBody.messages);

  // Apply Outbound DLP
  openAIBody.messages = tokensaver.applyTokenSavers(openAIBody.messages);
  const newChars = computePromptChars(openAIBody.messages);
  const savedTokens = Math.max(0, estimateTokensFromText("x".repeat(Math.max(0, origChars - newChars))));
  const promptTokens = estimateTokensFromText("x".repeat(newChars));

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
  const upstreamRes = await dispatchToUpstream(c.req.raw, openAIBody as any, targetModel, isStream, c.req.raw.signal);

  if (!upstreamRes.ok) {
    recordRequestUsage({
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
    recordRequestUsage({
      protocol: "responses",
      model: targetModel,
      provider: providerType,
      status: 200,
      latencyMs: Date.now() - startTime,
      promptTokens: responsesJson.usage?.total_tokens ? Math.floor(responsesJson.usage.total_tokens / 2) : promptTokens,
      completionTokens: 25,
      savedTokens,
      stream: false,
    });
    return c.json(responsesJson);
  } else {
    recordRequestUsage({
      protocol: "responses",
      model: targetModel,
      provider: providerType,
      status: 200,
      latencyMs: Date.now() - startTime,
      promptTokens,
      completionTokens: 25,
      savedTokens,
      stream: true,
    });
    // Stream Responses format
    const reader = upstreamRes.body?.getReader();
    if (!reader) return upstreamRes;
    const decoder = new TextDecoder();
    const frames = responsesStreamFrames(targetModel);

    return streamSSE(c, async (stream) => {
      let buffer = "";
      let tokenCount = 0;

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
              if (dataStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(dataStr);
                const deltaContent = parsed.choices?.[0]?.delta?.content;
                if (deltaContent) {
                  tokenCount++;
                  await stream.write(frames.delta(deltaContent));
                }
              } catch {}
            }
          }
        }
        await stream.write(frames.end(Math.max(tokenCount, 1)));
      } finally {
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
