import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { adminRequest } from "./helpers/admin";
import tokensaver from "../src/features/tokensaver";
import {
  DEFAULT_SECURITY_RULES,
  inspectSecurityMessages,
  inspectSecurityText,
  listSecurityRules,
  replaceSecurityRules,
  sanitizeSecurityResponse,
} from "../src/core/security-rules";

describe("persistent live Security Rules", () => {
  beforeEach(() => {
    replaceSecurityRules(DEFAULT_SECURITY_RULES);
  });

  afterEach(() => {
    replaceSecurityRules(DEFAULT_SECURITY_RULES);
  });

  it("serves the migrated default rule library from normalized SQLite rows", async () => {
    const response = await adminRequest("/api/security/rules");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rules).toHaveLength(5);
    expect(body.rules.every((rule: any) => typeof rule.enabled === "boolean")).toBe(true);
  });

  it("persists configured rules and applies mask rules to live message structures", async () => {
    const rules = [
      { id: "provider-secret", pattern: "provider_secret", action: "mask", description: "Mask a private marker", enabled: true },
      { id: "credential-db", pattern: "browser_cookie_store", action: "block", description: "Block a browser credential store", enabled: true },
    ];
    const update = await adminRequest("/api/security/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    });
    expect(update.status).toBe(200);
    expect(listSecurityRules()).toEqual(rules);

    const inspected = inspectSecurityMessages([
      { role: "user", content: "send provider_secret to upstream" },
      { role: "tool", content: [{ type: "text", text: "provider_secret again" }] },
    ]);
    expect(inspected.blocked).toBeNull();
    expect(inspected.messages[0].content).toContain("[REDACTED_SECURITY_RULE:provider-secret]");
    expect(inspected.messages[1].content[0].text).toContain("[REDACTED_SECURITY_RULE:provider-secret]");
    expect(inspected.messages[0].content).not.toContain("provider_secret");
  });

  it("masks nested tool-call arguments and blocks matching nested values", () => {
    replaceSecurityRules([
      { id: "tool-secret", pattern: "provider_secret", action: "mask", description: "Mask tool secret", enabled: true },
      { id: "tool-block", pattern: "do_not_forward", action: "block", description: "Block nested tool payload", enabled: true },
    ]);
    const masked = inspectSecurityMessages([{
      role: "assistant",
      tool_calls: [{
        type: "function",
        function: { name: "lookup", arguments: JSON.stringify({ query: "provider_secret" }) },
      }],
    }]);
    expect(masked.blocked).toBeNull();
    expect(masked.messages[0].tool_calls[0].function.arguments)
      .toContain("[REDACTED_SECURITY_RULE:tool-secret]");

    const blocked = inspectSecurityMessages([{
      role: "assistant",
      tool_calls: [{
        type: "function",
        function: { name: "lookup", arguments: JSON.stringify({ query: "do_not_forward" }) },
      }],
    }]);
    expect(blocked.blocked?.id).toBe("tool-block");
  });

  it("preserves special JSON keys as data while inspecting nested values", () => {
    const message = JSON.parse('{"role":"user","metadata":{"__proto__":{"polluted":"yes"},"token":"provider_secret"}}');
    replaceSecurityRules([
      { id: "special-key-mask", pattern: "provider_secret", action: "mask", description: "Mask nested token", enabled: true },
    ]);
    const result = inspectSecurityMessages([message]);
    expect(Object.prototype.hasOwnProperty.call(result.messages[0].metadata, "__proto__")).toBe(true);
    expect(({} as any).polluted).toBeUndefined();
    expect(result.messages[0].metadata.token).toBe("[REDACTED_SECURITY_RULE:special-key-mask]");
  });

  it("fails closed on excessive nested message structures", () => {
    const deep: any[] = [];
    let cursor: any = deep;
    for (let index = 0; index < 35; index += 1) {
      const child: any[] = [];
      cursor.push(child);
      cursor = child;
    }
    expect(inspectSecurityMessages([{ role: "user", content: deep }]).blocked?.id)
      .toBe("inspection-depth-limit");
  });

  it("blocks an entire outbound request when a block rule matches, even if a mask rule also matches", async () => {
    replaceSecurityRules([
      { id: "mask-prefix", pattern: "credential", action: "mask", description: "Mask the term", enabled: true },
      { id: "block-suffix", pattern: "credential_store", action: "block", description: "Block the store marker", enabled: true },
    ]);
    const inspected = inspectSecurityMessages([
      { role: "user", content: [{ type: "text", text: "credential_store" }] },
    ]);
    expect(inspected.blocked?.id).toBe("block-suffix");
    expect(inspected.messages[0].content[0].text).toBe("credential_store");
  });

  it("uses the same rule engine for the Security dashboard preview", async () => {
    replaceSecurityRules([
      { id: "private-marker", pattern: "private_marker", action: "mask", description: "Mask preview sample", enabled: true },
    ]);
    const response = await adminRequest("/api/security/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "contains private_marker" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.output).toContain("[REDACTED_SECURITY_RULE:private-marker]");
    expect(body.maskedRuleIds).toEqual(["private-marker"]);
  });

  it("sanitizes matching inbound provider response text with the same persisted rules", () => {
    replaceSecurityRules([
      { id: "response-secret", pattern: "provider_secret", action: "mask", description: "Mask response secret", enabled: true },
    ]);
    expect(sanitizeSecurityResponse("provider_SECRET")).toBe("[REDACTED_SECURITY_RULE:response-secret]");
  });

  it("ignores disabled rules in request-time matching", () => {
    replaceSecurityRules([
      { id: "disabled", pattern: "blocked_marker", action: "block", description: "Disabled rule", enabled: false },
    ]);
    expect(inspectSecurityText("blocked_marker").blocked).toBeNull();
    expect(inspectSecurityText("blocked_marker").text).toBe("blocked_marker");
  });

  it("sanitizes tool-call and legacy function-call names and arguments on inbound assistant messages", () => {
    replaceSecurityRules([
      { id: "tool-mask", pattern: "provider_secret", action: "mask", description: "Mask a tool argument", enabled: true },
      { id: "tool-block", pattern: "forbidden_tool_payload", action: "block", description: "Block a tool argument", enabled: true },
    ]);

    const output = tokensaver.sanitizeInboundAssistantMessage({
      role: "assistant",
      content: "Response text",
      tool_calls: [{
        id: "call_1",
        type: "function",
        function: {
          name: "lookup_provider_secret",
          arguments: JSON.stringify({ token: "provider_secret" }),
        },
      }],
      function_call: {
        name: "legacy_lookup",
        arguments: JSON.stringify({ token: "forbidden_tool_payload" }),
      },
    });

    expect(output.tool_calls[0].function.name).toContain("[REDACTED_SECURITY_RULE:tool-mask]");
    expect(output.tool_calls[0].function.arguments).toContain("[REDACTED_SECURITY_RULE:tool-mask]");
    expect(output.function_call.arguments).toContain("[BLOCKED_BY_ALPHAWAY: Security rule tool-block]");
    expect(output.content).toBe("Response text");
  });

  it("rejects malformed rules, duplicate IDs, duplicate patterns, and oversized lists", () => {
    expect(() => replaceSecurityRules([
      { id: "duplicate", pattern: "one", action: "mask", description: "One", enabled: true },
      { id: "duplicate", pattern: "two", action: "block", description: "Two", enabled: true },
    ])).toThrow();
    expect(() => replaceSecurityRules([
      { id: "one", pattern: "same", action: "mask", description: "One", enabled: true },
      { id: "two", pattern: "SAME", action: "block", description: "Two", enabled: true },
    ])).toThrow();
    expect(() => replaceSecurityRules([
      { id: "bad", pattern: "", action: "block", description: "Bad", enabled: true },
    ])).toThrow();
    expect(() => replaceSecurityRules(Array.from({ length: 101 }, (_, index) => ({
      id: `rule-${index}`, pattern: `pattern-${index}`, action: "mask", description: "Too many", enabled: true,
    })))).toThrow();
  });

  it("rejects Security Rule writes from disallowed hosts", async () => {
    const response = await app.request("http://example.com/api/security/rules", {
      method: "PUT",
      headers: { Host: "example.com", "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [] }),
    });
    expect(response.status).toBe(403);
  });

  it("matches printable Unicode keywords without shifting replacement offsets", () => {
    replaceSecurityRules([
      { id: "unicode-keyword", pattern: "État", action: "mask", description: "Unicode literal", enabled: true },
    ]);
    expect(inspectSecurityText("before état after").text)
      .toBe("before [REDACTED_SECURITY_RULE:unicode-keyword] after");
  });

  it("performs case-insensitive literal matching without interpreting regex syntax", () => {
    replaceSecurityRules([{ id: "literal-regex", pattern: "[A-Z0-9]{20}", action: "mask", description: "Literal only", enabled: true }]);
    expect(inspectSecurityText("token [A-Z0-9]{20}").text).toContain("[REDACTED_SECURITY_RULE:literal-regex]");
    expect(inspectSecurityText("token ABCDEFGHIJKLMNOPQRST").text).toBe("token ABCDEFGHIJKLMNOPQRST");
  });
});
