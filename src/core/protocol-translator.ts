/**
 * Universal Protocol Translator for AlphaWay
 *
 * Provides bidirectional translation between:
 * 1. OpenAI Chat Completions API (/v1/chat/completions)
 * 2. Anthropic Claude Messages API (/v1/messages)
 * 3. OpenAI Codex Responses API (/v1/responses & /response)
 */

import { randomUUID } from "node:crypto";

// ============================================================================
// Types
// ============================================================================

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "developer";
  content: string | any[];
  name?: string;
}

export interface AnthropicContentBlock {
  type: "text" | "image";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicContentBlock[];
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
}

export interface ResponsesInputItem {
  type: string;
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

export interface ResponsesRequest {
  model: string;
  input?: string | ResponsesInputItem[];
  messages?: OpenAIMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
}

// ============================================================================
// Request Converters
// ============================================================================

/**
 * Converts Anthropic Claude /v1/messages request body into OpenAI Chat format
 */
export function anthropicToOpenAI(body: AnthropicRequest): {
  model: string;
  messages: OpenAIMessage[];
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
} {
  const messages: OpenAIMessage[] = [];

  // 1. Process System Prompt
  if (body.system) {
    let systemText = "";
    if (typeof body.system === "string") {
      systemText = body.system;
    } else if (Array.isArray(body.system)) {
      systemText = body.system
        .map((block) => (block.type === "text" ? block.text || "" : ""))
        .join("\n")
        .trim();
    }
    if (systemText) {
      messages.push({ role: "system", content: systemText });
    }
  }

  // 2. Process Messages
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      const role = msg.role === "assistant" ? "assistant" : "user";
      if (typeof msg.content === "string") {
        messages.push({ role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        // Concatenate text or convert blocks
        const textParts: string[] = [];
        const richParts: any[] = [];
        let hasRichMedia = false;

        for (const block of msg.content) {
          if (block.type === "text" && block.text) {
            textParts.push(block.text);
            richParts.push({ type: "text", text: block.text });
          } else if (block.type === "image" && block.source) {
            hasRichMedia = true;
            richParts.push({
              type: "image_url",
              image_url: {
                url: `data:${block.source.media_type};base64,${block.source.data}`,
              },
            });
          }
        }

        if (hasRichMedia) {
          messages.push({ role, content: richParts });
        } else {
          messages.push({ role, content: textParts.join("\n") });
        }
      }
    }
  }

  return {
    model: body.model,
    messages,
    stream: Boolean(body.stream),
    max_tokens: body.max_tokens,
    temperature: body.temperature,
  };
}

/**
 * Converts OpenAI Codex Responses /v1/responses request body into OpenAI Chat format
 */
export function responsesToOpenAI(body: ResponsesRequest): {
  model: string;
  messages: OpenAIMessage[];
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
} {
  // If request already has standard messages, prefer it
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return {
      model: body.model,
      messages: body.messages,
      stream: Boolean(body.stream),
      max_tokens: body.max_tokens,
      temperature: body.temperature,
    };
  }

  const messages: OpenAIMessage[] = [];

  if (typeof body.input === "string") {
    messages.push({ role: "user", content: body.input });
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (item.type === "message") {
        const rawRole = item.role || "user";
        const role: OpenAIMessage["role"] =
          rawRole === "assistant" ? "assistant" : rawRole === "developer" || rawRole === "system" ? "system" : "user";

        if (typeof item.content === "string") {
          messages.push({ role, content: item.content });
        } else if (Array.isArray(item.content)) {
          const text = item.content
            .map((c) => c.text || "")
            .join("\n")
            .trim();
          messages.push({ role, content: text });
        }
      }
    }
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: "" });
  }

  return {
    model: body.model,
    messages,
    stream: Boolean(body.stream),
    max_tokens: body.max_tokens,
    temperature: body.temperature,
  };
}

/**
 * Converts OpenAI Chat request body into Anthropic Claude /v1/messages format
 * (Used when upstream 3rd party provider is Anthropic)
 */
export function openAIToAnthropicRequest(body: {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}): AnthropicRequest {
  let systemPrompt = "";
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of body.messages || []) {
    if (msg.role === "system" || msg.role === "developer") {
      const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${text}` : text;
    } else {
      const role = msg.role === "assistant" ? "assistant" : "user";
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      anthropicMessages.push({ role, content });
    }
  }

  return {
    model: body.model,
    messages: anthropicMessages,
    system: systemPrompt || undefined,
    max_tokens: body.max_tokens || 4096,
    stream: Boolean(body.stream),
    temperature: body.temperature,
  };
}

// ============================================================================
// Non-Streaming Response Converters
// ============================================================================

/**
 * Converts standard OpenAI Chat JSON response into Anthropic Claude /v1/messages response
 */
export function openAIToAnthropicResponse(openAIJson: any, model: string): any {
  const content = openAIJson.choices?.[0]?.message?.content || "";
  const finishReason = openAIJson.choices?.[0]?.finish_reason;
  const stopReason = finishReason === "length" ? "max_tokens" : "end_turn";
  const msgId = "msg_" + randomUUID().replace(/-/g, "").slice(0, 24);

  return {
    id: msgId,
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: content,
      },
    ],
    model: openAIJson.model || model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: openAIJson.usage?.prompt_tokens || 15,
      output_tokens: openAIJson.usage?.completion_tokens || 25,
    },
  };
}

/**
 * Converts standard OpenAI Chat JSON response into OpenAI Codex /v1/responses response
 */
export function openAIToResponsesResponse(openAIJson: any, model: string): any {
  const content = openAIJson.choices?.[0]?.message?.content || "";
  const respId = "resp_" + randomUUID().replace(/-/g, "").slice(0, 24);

  return {
    id: respId,
    object: "response",
    status: "completed",
    model: openAIJson.model || model,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: content,
          },
        ],
      },
    ],
    usage: {
      total_tokens: openAIJson.usage?.total_tokens || 40,
      input_tokens: openAIJson.usage?.prompt_tokens || 15,
      output_tokens: openAIJson.usage?.completion_tokens || 25,
    },
  };
}

// ============================================================================
// Streaming SSE Translators
// ============================================================================

/**
 * Creates Anthropic Claude SSE event frames from raw text chunks
 */
export function anthropicStreamFrames(model: string, msgId: string = "msg_" + randomUUID().replace(/-/g, "").slice(0, 24)) {
  return {
    start: () =>
      `event: message_start\ndata: ${JSON.stringify({
        type: "message_start",
        message: {
          id: msgId,
          type: "message",
          role: "assistant",
          content: [],
          model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 20, output_tokens: 0 },
        },
      })}\n\n` +
      `event: content_block_start\ndata: ${JSON.stringify({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      })}\n\n`,

    delta: (text: string) =>
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text },
      })}\n\n`,

    end: (outputTokens: number = 20) =>
      `event: content_block_stop\ndata: ${JSON.stringify({
        type: "content_block_stop",
        index: 0,
      })}\n\n` +
      `event: message_delta\ndata: ${JSON.stringify({
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: outputTokens },
      })}\n\n` +
      `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  };
}

/**
 * Creates OpenAI Responses SSE event frames from raw text chunks
 */
export function responsesStreamFrames(model: string, respId: string = "resp_" + randomUUID().replace(/-/g, "").slice(0, 24)) {
  let accumulated = "";

  return {
    delta: (text: string) => {
      accumulated += text;
      return `data: ${JSON.stringify({
        type: "response.output_text.delta",
        delta: text,
      })}\n\n`;
    },

    end: (outputTokens: number = 20) =>
      `data: ${JSON.stringify({
        type: "response.completed",
        response: {
          id: respId,
          object: "response",
          status: "completed",
          model,
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: accumulated,
                },
              ],
            },
          ],
          usage: {
            total_tokens: outputTokens + 20,
            input_tokens: 20,
            output_tokens: outputTokens,
          },
        },
      })}\n\n`,
  };
}
