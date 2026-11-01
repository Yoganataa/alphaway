import { test, expect } from "bun:test";
import * as opencode from "../src/providers/opencode";

test("src/providers/opencode TypeScript module > exports core gate functions", () => {
  expect(typeof opencode.buildUpstreamPayload).toBe("function");
  expect(typeof opencode.buildUpstreamHeaders).toBe("function");
  expect(typeof opencode.getPersistentSessionId).toBe("function");
  expect(typeof opencode.normalizeModel).toBe("function");
  expect(typeof opencode.createId).toBe("function");
  expect(typeof opencode.gateSafeUserAgent).toBe("function");
});

test("src/providers/opencode TypeScript module > normalizes model strings and strips provider prefixes", () => {
  expect(opencode.normalizeModel("opencode/glm-4-flash")).toBe("glm-4-flash");
  expect(opencode.normalizeModel("opencode/longcat")).toBe("longcat");
  expect(opencode.normalizeModel("")).toBe("");
  expect(opencode.normalizeModel(null)).toBe("");
  expect(opencode.normalizeModel(undefined)).toBe("");
});

test("src/providers/opencode TypeScript module > generates valid snowflake/ulid-like createId without counter overflow", () => {
  const id1 = opencode.createId();
  const id2 = opencode.createId();
  expect(typeof id1).toBe("string");
  expect(id1.length).toBeGreaterThan(10);
  expect(id1).not.toBe(id2);
});

test("src/providers/opencode TypeScript module > builds upstream payload containing required anchor read tool", () => {
  const req: any = {
    model: "glm-4-flash",
    messages: [{ role: "user", content: "Hello" }],
  };
  const { upstreamBody, aliasToOriginal } = opencode.buildUpstreamPayload(req, "glm-4-flash", false);
  expect(upstreamBody.model).toBe("glm-4-flash");
  expect(Array.isArray(upstreamBody.tools)).toBe(true);
  const toolNames = upstreamBody.tools.map((t: any) => t.function?.name || t.name);
  expect(toolNames).toContain("read");
});
