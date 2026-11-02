/**
 * Anthropic Claude /v1/messages & /messages Protocol Tests
 */

import { describe, it, expect } from "bun:test";
import { app } from "../src/app";
import { anthropicToOpenAI, openAIToAnthropicResponse } from "../src/core/protocol-translator";

// Exercise protocol compatibility using the retained environment-key adapter.
process.env.API_KEY = "sk-test-anthropic-compat-key";

describe("Anthropic Claude Protocol Translator", () => {
  it("translates Anthropic request with system string and messages to OpenAI format", () => {
    const anthropicReq = {
      model: "mimo-v2.6-flash-free",
      max_tokens: 1024,
      system: "You are a concise assistant.",
      messages: [
        { role: "user" as const, content: "Hello!" },
        { role: "assistant" as const, content: "Hi! How can I help?" },
        { role: "user" as const, content: "What is 2+2?" },
      ],
      stream: true,
      temperature: 0.5,
    };

    const openAI = anthropicToOpenAI(anthropicReq);
    expect(openAI.model).toBe("mimo-v2.6-flash-free");
    expect(openAI.stream).toBe(true);
    expect(openAI.max_tokens).toBe(1024);
    expect(openAI.temperature).toBe(0.5);

    // Verify system message is prepended
    expect(openAI.messages.length).toBe(4);
    expect(openAI.messages[0]).toEqual({ role: "system", content: "You are a concise assistant." });
    expect(openAI.messages[1]).toEqual({ role: "user", content: "Hello!" });
    expect(openAI.messages[2]).toEqual({ role: "assistant", content: "Hi! How can I help?" });
    expect(openAI.messages[3]).toEqual({ role: "user", content: "What is 2+2?" });
  });

  it("translates Anthropic content blocks array to text", () => {
    const anthropicReq = {
      model: "mimo-v2.6-flash-free",
      system: [{ type: "text" as const, text: "System instruction block" }],
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: "Part 1 of user input." },
            { type: "text" as const, text: "Part 2 of user input." },
          ],
        },
      ],
    };

    const openAI = anthropicToOpenAI(anthropicReq);
    expect(openAI.messages[0].content).toBe("System instruction block");
    expect(openAI.messages[1].content).toBe("Part 1 of user input.\nPart 2 of user input.");
  });

  it("converts OpenAI JSON response to Anthropic message response", () => {
    const openAIResponse = {
      id: "chatcmpl-12345",
      object: "chat.completion",
      created: 1710000000,
      model: "mimo-v2.6-flash-free",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "The answer is 4." },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 15,
        completion_tokens: 8,
        total_tokens: 23,
      },
    };

    const anthropicRes = openAIToAnthropicResponse(openAIResponse, "mimo-v2.6-flash-free");
    expect(anthropicRes.type).toBe("message");
    expect(anthropicRes.role).toBe("assistant");
    expect(anthropicRes.content).toEqual([{ type: "text", text: "The answer is 4." }]);
    expect(anthropicRes.model).toBe("mimo-v2.6-flash-free");
    expect(anthropicRes.stop_reason).toBe("end_turn");
    expect(anthropicRes.usage.input_tokens).toBe(15);
    expect(anthropicRes.usage.output_tokens).toBe(8);
  });
});

describe("Anthropic HTTP Endpoints (/v1/messages & /messages)", () => {
  const getHeaders = (extra: Record<string, string> = {}) => ({
    "Content-Type": "application/json",
    ...(process.env.API_KEY ? { "Authorization": `Bearer ${process.env.API_KEY}` } : {}),
    ...extra,
  });

  it("rejects request missing model parameter with Anthropic error format", async () => {
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.type).toBe("error");
    expect(json.error.message).toContain("model is required");
  });

  it("rejects request missing messages parameter with Anthropic error format", async () => {
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ model: "mimo-v2.6-flash-free" }),
    });

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.type).toBe("error");
    expect(json.error.message).toContain("messages is required");
  });

  it("accepts x-api-key header on /v1/messages", async () => {
    if (!process.env.API_KEY) return;
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.API_KEY,
      },
      body: JSON.stringify({}),
    });
    // With valid auth, missing model should produce 400 instead of 401
    expect(res.status).toBe(400);
  });
});
