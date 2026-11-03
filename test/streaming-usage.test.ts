import { beforeEach, describe, expect, it } from "bun:test";
import { issueAPIKey } from "../src/core/api-keys";
import { getDatabase } from "../src/core/database";
import { resetUsageStats } from "../src/core/usage-tracker";
import { trackOpenAIStreamingUsage } from "../src/routes/chat";

describe("managed-key OpenAI stream metering", () => {
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
});
