/**
 * OpenAI Responses / Codex Protocol Tests (/v1/responses & /response)
 */

import { describe, it, expect } from "bun:test";
import { app } from "../src/app";
import { responsesToOpenAI, openAIToResponsesResponse } from "../src/core/protocol-translator";

describe("OpenAI Responses / Codex Protocol Translator", () => {
  it("translates string input into OpenAI user message", () => {
    const responsesReq = {
      model: "mimo-v2.6-flash-free",
      input: "Write a quick test function",
      stream: false,
    };

    const openAI = responsesToOpenAI(responsesReq);
    expect(openAI.model).toBe("mimo-v2.6-flash-free");
    expect(openAI.messages).toEqual([{ role: "user", content: "Write a quick test function" }]);
    expect(openAI.stream).toBe(false);
  });

  it("translates Codex structured input array into messages", () => {
    const responsesReq = {
      model: "mimo-v2.6-flash-free",
      stream: true,
      input: [
        {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "Respond in terse markdown." }],
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Refactor this loop." }],
        },
      ],
    };

    const openAI = responsesToOpenAI(responsesReq);
    expect(openAI.messages.length).toBe(2);
    expect(openAI.messages[0]).toEqual({ role: "system", content: "Respond in terse markdown." });
    expect(openAI.messages[1]).toEqual({ role: "user", content: "Refactor this loop." });
  });

  it("converts OpenAI JSON response to Responses output object", () => {
    const openAIResponse = {
      id: "chatcmpl-99999",
      object: "chat.completion",
      created: 1710000000,
      model: "mimo-v2.6-flash-free",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "for (const x of items) { ... }" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 15,
        total_tokens: 35,
      },
    };

    const responsesRes = openAIToResponsesResponse(openAIResponse, "mimo-v2.6-flash-free");
    expect(responsesRes.object).toBe("response");
    expect(responsesRes.status).toBe("completed");
    expect(responsesRes.output[0].type).toBe("message");
    expect(responsesRes.output[0].role).toBe("assistant");
    expect(responsesRes.output[0].content[0].type).toBe("output_text");
    expect(responsesRes.output[0].content[0].text).toBe("for (const x of items) { ... }");
  });
});

describe("Responses HTTP Endpoints (/v1/responses, /responses, /response)", () => {
  const getHeaders = (extra: Record<string, string> = {}) => ({
    "Content-Type": "application/json",
    ...(process.env.API_KEY ? { "Authorization": `Bearer ${process.env.API_KEY}` } : {}),
    ...extra,
  });

  it("rejects request missing model parameter with 400", async () => {
    const res = await app.request("/v1/responses", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ input: "hello" }),
    });

    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error.message).toContain("model is required");
  });

  it("serves /response and /responses aliases equivalently", async () => {
    const res1 = await app.request("/response", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ input: "hello" }),
    });
    expect(res1.status).toBe(400);

    const res2 = await app.request("/responses", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ input: "hello" }),
    });
    expect(res2.status).toBe(400);
  });

  it("accepts x-api-key and api-key on /v1/responses and /response", async () => {
    if (!process.env.API_KEY) return;
    const resX = await app.request("/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.API_KEY,
      },
      body: JSON.stringify({}),
    });
    expect(resX.status).toBe(400);

    const resApi = await app.request("/response", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.API_KEY,
      },
      body: JSON.stringify({}),
    });
    expect(resApi.status).toBe(400);
  });
});
