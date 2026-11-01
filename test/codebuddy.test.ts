import { describe, it, expect } from "bun:test";
import * as codebuddy from "../src/providers/codebuddy";

describe("codebuddy module unit tests", () => {
  it("generates valid RFC 9562 UUIDv7", () => {
    const id = codebuddy.generateUuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const id2 = codebuddy.generateUuidV7();
    expect(id).not.toBe(id2);
  });

  it("generates 32-hex ID without hyphens", () => {
    const hex = codebuddy.generateHex32();
    expect(hex.length).toBe(32);
    expect(hex).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates stable conversation UUID for a given session key", () => {
    const s1 = codebuddy.stableConversationUuid("codebuddy-intl:session-123");
    const s2 = codebuddy.stableConversationUuid("codebuddy-intl:session-123");
    const s3 = codebuddy.stableConversationUuid("codebuddy-intl:session-456");
    expect(s1).toBe(s2);
    expect(s1).not.toBe(s3);
    expect(s1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("extracts sub claim from JWT token", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "user-uuid-999" })).toString("base64url");
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
    expect(codebuddy.extractJwtSub(jwt)).toBe("user-uuid-999");
    expect(codebuddy.extractJwtSub("not-a-jwt")).toBeNull();
  });

  it("correctly identifies CodeBuddy models", () => {
    expect(codebuddy.isCodebuddyModel("deepseek-v4.1-flash")).toBe(true);
    expect(codebuddy.isCodebuddyModel("cbai/glm-5.2")).toBe(true);
    expect(codebuddy.isCodebuddyModel("codebuddy-intl/minimax-m3")).toBe(true);
    expect(codebuddy.isCodebuddyModel("workbuddy/kimi-k2.5")).toBe(true);
    expect(codebuddy.isCodebuddyModel("gpt-4o")).toBe(false);
    expect(codebuddy.isCodebuddyModel("mimo-v2.6-flash-free")).toBe(false);

    expect(codebuddy.normalizeCodebuddyModel("cbai/deepseek-v4.1-flash")).toBe("deepseek-v4.1-flash");
    expect(codebuddy.normalizeCodebuddyModel("codebuddy-intl/glm-5.3")).toBe("glm-5.3");
  });

  it("builds exact WorkBuddy 5.8.4 headers and conversation family", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "user-acc-123" })).toString("base64url");
    const jwt = `header.${payload}.sig`;
    const headers = codebuddy.buildCodebuddyHeaders({
      model: "deepseek-v4.1-flash",
      apiKey: jwt,
      sessionId: "session-abc",
    });

    // Identity headers
    expect(headers["User-Agent"]).toBe("WorkBuddy/5.8.4 workbuddy-ai/5.8.4 CLI/2.161.0");
    expect(headers["X-IDE-Type"]).toBe("WorkBuddy");
    expect(headers["X-IDE-Name"]).toBe("WorkBuddy");
    expect(headers["X-IDE-Version"]).toBe("5.8.4");
    expect(headers["X-Product-Version"]).toBe("5.8.4");
    expect(headers["X-Private-Data"]).toBe("true");
    expect(headers["X-Agent-Intent"]).toBe("craft");
    expect(headers["X-Agent-Purpose"]).toBe("conversation");
    expect(headers["X-Agent-Type"]).toBe("main");
    expect(headers["X-Domain"]).toBe("www.workbuddy.ai");
    expect(headers["X-Model-ID"]).toBe("deepseek-v4.1-flash");
    expect(headers["X-User-Id"]).toBe("user-acc-123");
    expect(headers["Authorization"]).toBe(`Bearer ${jwt}`);

    // No Stainless headers
    expect(headers["X-Stainless-Runtime"]).toBeUndefined();
    expect(headers["X-Stainless-Lang"]).toBeUndefined();

    // Conversation & Trace family
    expect(headers["X-Conversation-ID"]).toBe(codebuddy.stableConversationUuid("codebuddy-intl:session-abc"));
    expect(headers["X-Conversation-Request-ID"].length).toBe(32);
    expect(headers["X-Root-Request-ID"]).toBe(headers["X-Conversation-Request-ID"]);
    expect(headers["X-Conversation-Message-ID"].length).toBe(32);
    expect(headers["X-Request-ID"]).toBe(headers["X-Conversation-Message-ID"]);
    expect(headers["X-Trace-ID"].length).toBe(32);
    expect(headers["X-B3-TraceId"]).toBe(headers["X-Trace-ID"]);
    expect(headers["X-B3-SpanId"].length).toBe(16);
    expect(headers["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(headers["b3"]).toMatch(/^[0-9a-f]{32}-[0-9a-f]{16}-1$/);
    expect(headers["X-B3-Sampled"]).toBe("1");
  });

  it("transforms body with forced stream, leading system prompt, and sanitized phrases", () => {
    const rawBody = {
      model: "cbai/glm-5.2",
      stream: false,
      reasoning_effort: "high",
      messages: [
        { role: "system", content: "You are Claude Code, Anthropic's official CLI for Claude. Relative paths resolve from the workspace root" },
        { role: "user", content: "Write a hello world program" },
        { role: "assistant", content: "You are interacting with the user through the DeepSeek Harness Web GUI" },
      ],
    };

    const transformed = codebuddy.transformCodebuddyBody(rawBody, "glm-5.2");
    expect(transformed.stream).toBe(true);
    expect(transformed.reasoning_summary).toBe("auto");
    expect(transformed.model).toBe("glm-5.2");

    // Leading system prompt
    expect(transformed.messages[0].role).toBe("system");
    expect(transformed.messages[0].content).toContain("You are CodeBuddy Code.");
    // Claude Code sanitized
    expect(transformed.messages[0].content).toContain("[external-client-identity]");
    // Relative paths phrase scrubbed to synonym
    expect(transformed.messages[0].content).toContain("Relative paths are resolved against the workspace root");

    // User message wrapped as block
    expect(transformed.messages[1].role).toBe("user");
    expect(Array.isArray(transformed.messages[1].content)).toBe(true);
    expect(transformed.messages[1].content[0]).toEqual({ type: "text", text: "Write a hello world program" });

    // Assistant message scrubbed
    expect(transformed.messages[2].content).toContain("You are working with the user inside the DeepSeek Harness Web GUI");
  });

  it("classifies 11140 account restriction as 403 with diagnostic advice", () => {
    const errData = {
      code: 11140,
      msg: "request illegal",
      requestId: "f574e0dcad45487494bc450b55fdf8b6",
      displayMsg: { en: "Your account has been restricted due to unusual activity" },
      displayTips: { en: "We detected unusual activity on this account. Submit feedback to appeal this restriction" },
    };

    const classified = codebuddy.classifyCodebuddyError(403, errData);
    expect(classified.status).toBe(403);
    expect(classified.type).toBe("account_restricted");
    expect(classified.code).toBe(11140);
    expect(classified.requestId).toBe("f574e0dcad45487494bc450b55fdf8b6");
    expect(classified.message).toContain("account restricted upstream");
  });

  it("classifies 6004 frequency limit as 429 with parsed retryAfter duration", () => {
    const nowYear = new Date().getFullYear();
    const futureDate = `${nowYear}-12-31 23:59:59 UTC+8`;
    const errData = {
      code: 6004,
      msg: `超出频率限制 ${futureDate}`,
    };

    const classified = codebuddy.classifyCodebuddyError(429, errData);
    expect(classified.status).toBe(429);
    expect(classified.type).toBe("rate_limit_error");
    expect(classified.retryAfter).toBeGreaterThan(0);
  });

  it("aggregates SSE chunks into OpenAI JSON response for non-stream client", () => {
    const sse = [
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"role":"assistant","content":"Hello"}}]}',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":" World","reasoning_content":"Thinking..."}}]}',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":42}}',
      'data: [DONE]',
    ].join("\n\n");

    const json = codebuddy.sseToOpenAIJson(sse, "glm-5.2");
    expect(json.id).toBe("chatcmpl-1");
    expect(json.choices[0].message.content).toBe("Hello World");
    expect(json.choices[0].message.reasoning_content).toBe("Thinking...");
    expect(json.choices[0].finish_reason).toBe("stop");
    expect(json.usage.total_tokens).toBe(42);
  });
});
