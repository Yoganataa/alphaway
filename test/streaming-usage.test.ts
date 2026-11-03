import { beforeEach, describe, expect, it } from "bun:test";
import { issueAPIKey } from "../src/core/api-keys";
import { getDatabase } from "../src/core/database";
import { resetUsageStats } from "../src/core/usage-tracker";
import { resolveOpenAIResponseUsage, trackOpenAIStreamingUsage } from "../src/routes/chat";

describe("managed-key OpenAI stream metering", () => {
  it("estimates non-streaming tool-call output when provider usage is absent", () => {
    const toolArguments = JSON.stringify({ city: "Paris" });
    const result = resolveOpenAIResponseUsage({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            function: { name: "lookup_weather", arguments: toolArguments },
          }],
        },
      }],
    }, 11);

    expect(result.promptTokens).toBe(11);
    expect(result.completionTokens).toBeGreaterThan(0);
    expect(result.completionTokens).toBe(Math.ceil(("lookup_weather" + toolArguments).length / 3.8));
  });

  it("preserves authoritative provider usage values of zero", () => {
    const result = resolveOpenAIResponseUsage({
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      choices: [{ message: { content: "This must not replace authoritative zero usage." } }],
    }, 19);

    expect(result).toEqual({ promptTokens: 0, completionTokens: 0 });
  });

  it("falls back to text estimation when non-streaming provider usage is missing", () => {
    const content = "Estimated answer";
    const result = resolveOpenAIResponseUsage({
      choices: [{ message: { content } }],
    }, 7);

    expect(result.promptTokens).toBe(7);
    expect(result.completionTokens).toBe(Math.ceil(content.length / 3.8));
  });

  beforeEach(() => {
    resetUsageStats();
  });

  it("records usage and settles quota once when a stream completes normally", async () => {
    const key = issueAPIKey("OpenAI stream completion");
    const encoder = new TextEncoder();
    let settlementCalls = 0;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"complete response"}}]}\n\n'));
        controller.close();
      },
    });
    const tracked = trackOpenAIStreamingUsage(new Response(source), {
      clientApiKeyId: key.record.id,
      model: "stream-meter-model",
      provider: "opencode",
      startedAt: Date.now(),
      promptTokens: 10,
      savedTokens: 0,
      settleQuota: () => { settlementCalls += 1; },
    });

    await tracked.text();
    const rows = getDatabase().prepare(
      "SELECT COUNT(*) AS count, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(total_tokens) AS total_tokens FROM request_logs WHERE client_api_key_id = ?"
    ).get(key.record.id);
    expect(rows.count).toBe(1);
    expect(rows.prompt_tokens).toBe(10);
    expect(rows.completion_tokens).toBeGreaterThan(0);
    expect(rows.total_tokens).toBe(rows.prompt_tokens + rows.completion_tokens);
    expect(settlementCalls).toBe(1);
  });

  it("records partial usage and settles quota once when a client cancels an OpenAI stream", async () => {
    const key = issueAPIKey("OpenAI stream cancellation");
    const encoder = new TextEncoder();
    let upstreamCancelled = false;
    let settlementCalls = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"partial response"}}]}\n\n'));
      },
      cancel() {
        upstreamCancelled = true;
      },
    });
    const tracked = trackOpenAIStreamingUsage(new Response(source), {
      clientApiKeyId: key.record.id,
      model: "stream-meter-model",
      provider: "opencode",
      startedAt: Date.now(),
      promptTokens: 10,
      savedTokens: 0,
      settleQuota: () => { settlementCalls += 1; },
    });
    const reader = tracked.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("partial response");
    await reader.cancel("client disconnected");

    const rows = getDatabase().prepare(
      "SELECT COUNT(*) AS count, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(total_tokens) AS total_tokens FROM request_logs WHERE client_api_key_id = ?"
    ).get(key.record.id);
    expect(upstreamCancelled).toBe(true);
    expect(rows.count).toBe(1);
    expect(rows.prompt_tokens).toBe(10);
    expect(rows.completion_tokens).toBeGreaterThan(0);
    expect(rows.total_tokens).toBe(rows.prompt_tokens + rows.completion_tokens);
    expect(settlementCalls).toBe(1);
  });

  it("counts streamed tool-call names and arguments as completion usage", async () => {
    const key = issueAPIKey("OpenAI stream tool call");
    const encoder = new TextEncoder();
    let settlementTokens = 0;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        const toolCallEvent = {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                function: { name: "lookup_weather", arguments: JSON.stringify({ city: "Paris" }) },
              }],
            },
          }],
        };
        controller.enqueue(encoder.encode("data: " + JSON.stringify(toolCallEvent) + "\n\n" + "data: [DONE]\n\n"));
        controller.close();
      },
    });
    const tracked = trackOpenAIStreamingUsage(new Response(source), {
      clientApiKeyId: key.record.id,
      model: "stream-tool-meter-model",
      provider: "opencode",
      startedAt: Date.now(),
      promptTokens: 10,
      savedTokens: 0,
      settleQuota: (tokens) => { settlementTokens = tokens; },
    });

    await tracked.text();
    const row = getDatabase().prepare(
      "SELECT COUNT(*) AS count, SUM(completion_tokens) AS completion_tokens, SUM(total_tokens) AS total_tokens FROM request_logs WHERE client_api_key_id = ?"
    ).get(key.record.id);
    expect(row.count).toBe(1);
    expect(row.completion_tokens).toBeGreaterThan(0);
    expect(settlementTokens).toBe(row.total_tokens);
  });

  it("prefers final provider-reported prompt and completion usage", async () => {
    const key = issueAPIKey("OpenAI stream authoritative usage");
    const encoder = new TextEncoder();
    let settlementTokens = 0;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        const contentEvent = { choices: [{ delta: { content: "visible response" } }] };
        const usageEvent = { choices: [], usage: { prompt_tokens: 17, completion_tokens: 23, total_tokens: 40 } };
        controller.enqueue(encoder.encode(
          "data: " + JSON.stringify(contentEvent) + "\n\n" +
          "data: " + JSON.stringify(usageEvent) + "\n\n"
        ));
        controller.close();
      },
    });
    const tracked = trackOpenAIStreamingUsage(new Response(source), {
      clientApiKeyId: key.record.id,
      model: "stream-provider-usage-model",
      provider: "opencode",
      startedAt: Date.now(),
      promptTokens: 5,
      savedTokens: 0,
      settleQuota: (tokens) => { settlementTokens = tokens; },
    });

    await tracked.text();
    const row = getDatabase().prepare(
      "SELECT COUNT(*) AS count, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(total_tokens) AS total_tokens FROM request_logs WHERE client_api_key_id = ?"
    ).get(key.record.id);
    expect(row.count).toBe(1);
    expect(row.prompt_tokens).toBe(17);
    expect(row.completion_tokens).toBe(23);
    expect(row.total_tokens).toBe(40);
    expect(settlementTokens).toBe(40);
  });
});
