import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { issueAPIKey, setAPIKeyPolicy } from "../src/core/api-keys";
import { __clearManagedKeyRateLimiterForTests } from "../src/core/rate-limiter";
import { __resetProtocolLanes, identity } from "../src/providers/opencode";

type ProtocolCase = {
  name: string;
  path: string;
  body: Record<string, unknown>;
};

const cases: ProtocolCase[] = [
  {
    name: "OpenAI Chat",
    path: "/v1/chat/completions",
    body: {
      model: "mimo-v2.6-flash-free",
      stream: true,
      messages: [{ role: "user", content: "hold the stream open" }],
    },
  },
  {
    name: "Anthropic Messages",
    path: "/v1/messages",
    body: {
      model: "mimo-v2.6-flash-free",
      max_tokens: 64,
      stream: true,
      messages: [{ role: "user", content: "hold the stream open" }],
    },
  },
  {
    name: "Codex Responses",
    path: "/v1/responses",
    body: {
      model: "mimo-v2.6-flash-free",
      stream: true,
      input: "hold the stream open",
    },
  },
];

describe("managed-key gateway concurrency releases streamed requests", () => {
  let originalFetch: typeof globalThis.fetch;
  let cancelCount = 0;
  let upstreamCalls = 0;

  beforeEach(() => {
    process.env.API_KEY = "";
    process.env.BRIDGE_API_KEY = "";
    __clearManagedKeyRateLimiterForTests();
    identity.__reset();
    identity.__setLastCheckTime(Date.now());
    __resetProtocolLanes();
    cancelCount = 0;
    upstreamCalls = 0;
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      upstreamCalls += 1;
      const event = new TextEncoder().encode(
        'data: {"choices":[{"index":0,"delta":{"content":"stream chunk"},"finish_reason":null}]}\\n\\n',
      );
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(event);
        },
        cancel() {
          cancelCount += 1;
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    __clearManagedKeyRateLimiterForTests();
    identity.__reset();
    __resetProtocolLanes();
  });

  for (const protocol of cases) {
    it(`${protocol.name} releases the concurrency slot after downstream cancellation`, async () => {
      const key = issueAPIKey(`Concurrency ${protocol.name}`);
      setAPIKeyPolicy(key.record.id, { concurrencyLimit: 1 });
      const headers = {
        Authorization: "Bearer " + key.secret,
        "Content-Type": "application/json",
      };
      const request = () => app.request(protocol.path, {
        method: "POST",
        headers,
        body: JSON.stringify(protocol.body),
      });

      const first = await request();
      expect(first.status).toBe(200);
      expect(first.body).not.toBeNull();
      const firstReader = first.body!.getReader();
      const firstChunk = await firstReader.read();
      expect(firstChunk.done).toBe(false);
      expect(firstChunk.value?.length).toBeGreaterThan(0);
      expect(upstreamCalls).toBe(1);

      const blocked = await request();
      expect(blocked.status).toBe(429);
      const blockedPayload = await blocked.json() as any;
      const blockedCode = blockedPayload?.error?.code ?? blockedPayload?.error?.type;
      expect(blockedCode).toBe("rate_limit_exceeded");
      expect(upstreamCalls).toBe(1);

      await firstReader.cancel("client disconnected");
      expect(cancelCount).toBeGreaterThan(0);

      const admittedAfterCancel = await request();
      expect(admittedAfterCancel.status).toBe(200);
      expect(upstreamCalls).toBe(2);
      const secondReader = admittedAfterCancel.body!.getReader();
      await secondReader.read();
      await secondReader.cancel("test cleanup");
    }, 15000);
  }
});
