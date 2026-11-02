import { describe, it, beforeAll, afterAll, expect } from "bun:test";
import { app } from "../src/app";

describe("auth & tunnel configuration", () => {
  let server: any;
  let port: number;

  beforeAll(async () => {
    process.env.API_KEY = "sk-test-secret-123";
    process.env.PUBLIC_URL = "https://alphaway.mycustomdomain.com";

    const srv = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: app.fetch,
    });
    server = srv;
    port = srv.port;
  });

  afterAll(async () => {
    delete process.env.API_KEY;
    delete process.env.BRIDGE_API_KEY;
    delete process.env.PUBLIC_URL;
    server.stop();
  });

  it("rejects /v1/models when no Authorization header is provided", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/models`);
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("rejects /v1/models when incorrect Authorization header is provided", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { Authorization: "Bearer wrong-key" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts /v1/models when correct Authorization header is provided", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { Authorization: "Bearer sk-test-secret-123" },
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("accepts x-api-key header matching API_KEY", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { "x-api-key": "sk-test-secret-123" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects /v1/chat/completions with 401 when no key is provided", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "mimo-v2.6-flash-free", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects oversized bootstrap and login payloads before JSON parsing", async () => {
    const body = JSON.stringify({
      bootstrapToken: "invalid-token",
      username: "admin",
      password: "x".repeat(20 * 1024),
    });
    for (const endpoint of ["/api/admin/auth/bootstrap", "/api/admin/auth/login"]) {
      const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(res.status).toBe(413);
    }
  });

  it("exposes tunnel endpoint and auth requirement in /health", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.auth.required).toBe(true);
    expect(body.endpoint.tunnel).toBe(true);
    expect(body.endpoint.publicUrl).toBe("https://alphaway.mycustomdomain.com/v1");
  });

  it("renders tunnel URL and auth status in web panel", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { Host: "alphaway.mycustomdomain.com" },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("https://alphaway.mycustomdomain.com/v1");
    expect(html).toContain("Wajib — buat API key melalui dashboard");
  });
});
