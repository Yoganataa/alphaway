import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as http from "http";
import { app } from "../src/app";
import { issueAPIKey } from "../src/core/api-keys";
import { getDatabase } from "../src/core/database";
import { getCodeBuddyApiKey } from "../src/core/codebuddy-credentials";
import * as codebuddy from "../src/providers/codebuddy";
import * as opencode from "../src/providers/opencode";
import { adminHeaders } from "./helpers/admin";

describe("codebuddy server integration tests", () => {
  let mockUpstream: any;
  let mockPort: number;
  let capturedHeaders: any = null;
  let capturedBody: any = null;
  let mockResponseStatus = 200;
  let mockResponseBody = "";
  let mockIsSSE = true;
  const originalApiKey = process.env.API_KEY;
  const originalCodeBuddyApiKey = process.env.CODEBUDDY_API_KEY;
  let gatewayApiKey = "";

  beforeAll((done: any) => {
    // Gateway identity and provider identity are separate credentials.
    gatewayApiKey = issueAPIKey("CodeBuddy integration test").secret;
    process.env.API_KEY = "sk-test-codebuddy-gateway-key";
    delete process.env.BRIDGE_API_KEY;
    process.env.CODEBUDDY_API_KEY = "test-codebuddy-jwt-token";
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
    if (originalApiKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = originalApiKey;
    if (originalCodeBuddyApiKey === undefined) delete process.env.CODEBUDDY_API_KEY;
    else process.env.CODEBUDDY_API_KEY = originalCodeBuddyApiKey;
    delete process.env.CODEBUDDY_INTL_URL;
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
      const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
        headers: { Authorization: `Bearer ${gatewayApiKey}` },
      });
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

  it("requires an AlphaWay key before dispatching a CodeBuddy request", async () => {
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
      expect(json.error.code).toBe("invalid_api_key");
    } finally {
      testServer.stop();
    }
  });

  it("requires a separate CodeBuddy upstream credential after gateway authentication", async () => {
    const testServer = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    const port = testServer.port;
    const previousProviderKey = process.env.CODEBUDDY_API_KEY;
    delete process.env.CODEBUDDY_API_KEY;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayApiKey}`,
        },
        body: JSON.stringify({
          model: "cbai/deepseek-v4.1-flash",
          messages: [{ role: "user", content: "Halo" }],
        }),
      });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.error.code).toBe("codebuddy_auth_required");
    } finally {
      if (previousProviderKey === undefined) delete process.env.CODEBUDDY_API_KEY;
      else process.env.CODEBUDDY_API_KEY = previousProviderKey;
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
          Authorization: `Bearer ${gatewayApiKey}`,
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

      // Gateway Authorization is not reused as the upstream CodeBuddy credential.
      expect(capturedHeaders["authorization"]).toBe("Bearer test-codebuddy-jwt-token");
      expect(capturedHeaders["authorization"]).not.toBe(`Bearer ${gatewayApiKey}`);
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
          Authorization: `Bearer ${gatewayApiKey}`,
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


  it("stores OAuth tokens encrypted and never returns the upstream credential", async () => {
    const accessToken = "codebuddy-oauth-secret-that-must-not-leak";
    const previousProviderKey = process.env.CODEBUDDY_API_KEY;
    delete process.env.CODEBUDDY_API_KEY;
    (codebuddy as any).__setPollCodebuddyOAuth(async () => ({
      status: "authorized",
      accessToken,
      refreshToken: "codebuddy-refresh-secret",
    }));

    try {
      const headers = await adminHeaders();
      const response = await app.request("/api/codebuddy/oauth/poll?state=authorized-test", { headers });
      expect(response.status).toBe(200);
      const body: any = await response.json();
      expect(body.status).toBe("success");
      expect(body.accessToken).toBeUndefined();
      expect(body.refreshToken).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(accessToken);

      const row = getDatabase().prepare("SELECT value FROM app_settings WHERE key = ?")
        .get("codebuddy_api_key") as { value: string };
      const stored = JSON.parse(row.value);
      expect(stored).toMatch(/^awenc:v1:/);
      expect(stored).not.toContain(accessToken);
      delete process.env.CODEBUDDY_API_KEY;
      expect(getCodeBuddyApiKey()).toBe(accessToken);
    } finally {
      getDatabase().prepare("DELETE FROM app_settings WHERE key = ?").run("codebuddy_api_key");
      if (previousProviderKey === undefined) delete process.env.CODEBUDDY_API_KEY;
      else process.env.CODEBUDDY_API_KEY = previousProviderKey;
      (codebuddy as any).__setPollCodebuddyOAuth(null);
    }
  });

  it("handles CodeBuddy OAuth endpoints", async () => {
    (codebuddy as any).__setPollCodebuddyOAuth(async () => ({ status: "pending" }));

    const testServer = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    const port = testServer.port;

    try {
      const headers = await adminHeaders();
      const res = await fetch(`http://127.0.0.1:${port}/api/codebuddy/oauth/poll?state=test-state`, { headers });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.status).toBe("pending");
    } finally {
      (codebuddy as any).__setPollCodebuddyOAuth(null);
      testServer.stop();
    }
  });
});
