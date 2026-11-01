import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as http from "http";
import { app } from "../src/app";
import * as codebuddy from "../src/providers/codebuddy";
import * as opencode from "../src/providers/opencode";

describe("codebuddy server integration tests", () => {
  let mockUpstream: any;
  let mockPort: number;
  let capturedHeaders: any = null;
  let capturedBody: any = null;
  let mockResponseStatus = 200;
  let mockResponseBody = "";
  let mockIsSSE = true;
  const originalApiKey = process.env.API_KEY;

  beforeAll((done: any) => {
    // Disable bridge API_KEY for these tests to test CodeBuddy auth directly
    delete process.env.API_KEY;
    delete process.env.BRIDGE_API_KEY;
    mockUpstream = http.createServer((req: any, res: any) => {
      capturedHeaders = { ...req.headers };
      let data = "";
      req.on("data", (chunk: any) => (data += chunk));
      req.on("end", () => {
        try {
          capturedBody = JSON.parse(data);
        } catch {
          capturedBody = data;
        }

        if (mockIsSSE && mockResponseStatus === 200) {
          res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
          res.write('data: {"id":"chatcmpl-cb1","choices":[{"delta":{"role":"assistant","content":"Halo dari CodeBuddy!"}}]}\n\n');
          res.write('data: {"id":"chatcmpl-cb1","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.writeHead(mockResponseStatus, { "Content-Type": "application/json" });
          res.end(mockResponseBody);
        }
      });
    });

    mockUpstream.listen(0, "127.0.0.1", () => {
      mockPort = mockUpstream.address().port;
      process.env.CODEBUDDY_INTL_URL = `http://127.0.0.1:${mockPort}/v2/chat/completions`;
      done();
    });
  });

  afterAll((done: any) => {
    process.env.API_KEY = originalApiKey;
    delete process.env.CODEBUDDY_INTL_URL;
    delete process.env.CODEBUDDY_API_KEY;
    mockUpstream.close(done);
  });

  it("exposes codebuddy status in /health", async () => {
    const testServer = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    const port = testServer.port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.codebuddy).toBeDefined();
      expect(data.codebuddy.supported).toBe(true);
      expect(data.codebuddy.models.includes("deepseek-v4.1-flash")).toBe(true);
    } finally {
      testServer.stop();
    }
  });

  it("lists CodeBuddy models in /v1/models", async () => {
    opencode.__setActiveModels([{ id: "mimo-v2.6-flash-free", object: "model" }]);
    const testServer = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    const port = testServer.port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/models`);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      const ids = data.data.map((m: any) => m.id);
      expect(ids.includes("deepseek-v4.1-flash")).toBe(true);
      expect(ids.includes("glm-5.2")).toBe(true);
      expect(ids.includes("minimax-m3")).toBe(true);
    } finally {
      testServer.stop();
    }
  });

  it("rejects CodeBuddy request with 401 when no API key is provided", async () => {
    const testServer = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    const port = testServer.port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "cbai/deepseek-v4.1-flash",
          messages: [{ role: "user", content: "Halo" }],
        }),
      });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.error.code).toBe("codebuddy_auth_required");
    } finally {
      testServer.stop();
    }
  });

  it("forwards CodeBuddy request with WorkBuddy 5.8.4 identity and channel verification", async () => {
    const testServer = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    const port = testServer.port;

    mockResponseStatus = 200;
    mockIsSSE = true;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-codebuddy-jwt-token",
        },
        body: JSON.stringify({
          model: "cbai/deepseek-v4.1-flash",
          messages: [{ role: "user", content: "Jelaskan binary search" }],
          stream: false,
        }),
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.choices[0].message.content).toBe("Halo dari CodeBuddy!");

      // Verify captured headers sent to upstream
      expect(capturedHeaders["user-agent"]).toBe("WorkBuddy/5.8.4 workbuddy-ai/5.8.4 CLI/2.161.0");
      expect(capturedHeaders["x-ide-type"]).toBe("WorkBuddy");
      expect(capturedHeaders["x-ide-version"]).toBe("5.8.4");
      expect(capturedHeaders["x-product-version"]).toBe("5.8.4");
      expect(capturedHeaders["x-domain"]).toBe("www.workbuddy.ai");
      expect(capturedHeaders["x-model-id"]).toBe("deepseek-v4.1-flash");
      expect(capturedHeaders["x-conversation-id"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(capturedHeaders["x-conversation-request-id"].length).toBe(32);
      expect(capturedHeaders["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

      // Verify captured body sent to upstream
      expect(capturedBody.stream).toBe(true); // Forced streaming
      expect(capturedBody.model).toBe("deepseek-v4.1-flash");
      expect(capturedBody.messages[0].role).toBe("system");
      expect(capturedBody.messages[0].content).toContain("You are CodeBuddy Code.");
      expect(capturedBody.messages[1].role).toBe("user");
      expect(capturedBody.messages[1].content[0].text).toBe("Jelaskan binary search");
    } finally {
      testServer.stop();
    }
  });

  it("handles upstream 11140 account restriction returning 403 with helpful advice", async () => {
    const testServer = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    const port = testServer.port;

    mockResponseStatus = 403;
    mockIsSSE = false;
    mockResponseBody = JSON.stringify({
      code: 11140,
      msg: "request illegal",
      requestId: "req-err-403",
      displayMsg: { en: "Your account has been restricted due to unusual activity" },
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          model: "glm-5.2",
          messages: [{ role: "user", content: "Halo" }],
        }),
      });

      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.error.code).toBe(11140);
      expect(json.error.type).toBe("account_restricted");
      expect(json.error.message).toContain("account restricted upstream");
      expect(json.error.requestId).toBe("req-err-403");
    } finally {
      testServer.stop();
    }
  });

  it("handles CodeBuddy OAuth endpoints", async () => {
    (codebuddy as any).__setPollCodebuddyOAuth(async () => ({ status: "pending" }));

    const testServer = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    const port = testServer.port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/codebuddy/oauth/poll?state=test-state`);
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.status).toBe("pending");
    } finally {
      (codebuddy as any).__setPollCodebuddyOAuth(null);
      testServer.stop();
    }
  });
});
