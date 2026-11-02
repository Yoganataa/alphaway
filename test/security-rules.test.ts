import { beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { adminRequest } from "./helpers/admin";
import { dbDeleteSetting, dbGetSetting } from "../src/core/database";

describe("persistent Security keyword rules", () => {
  beforeEach(() => {
    dbDeleteSetting("security_rules");
  });

  it("serves the default rule library without writing a redundant SQLite row", async () => {
    const response = await adminRequest("/api/security/rules");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.rules)).toBe(true);
    expect(body.rules).toHaveLength(5);
    expect(body.rules.every((rule: any) => typeof rule.enabled === "boolean")).toBe(true);
    expect(dbGetSetting("security_rules", null)).toBeNull();
  });

  it("persists custom rule changes in SQLite and returns them after a reload", async () => {
    const rules = [
      {
        id: "custom-provider-key",
        pattern: "provider_secret",
        action: "mask",
        description: "Mask custom provider secrets",
        enabled: true,
      },
      {
        id: "block-cookie-database",
        pattern: "browser_cookie_database",
        action: "block",
        description: "Block browser credential database access",
        enabled: false,
      },
    ];

    const update = await adminRequest("/api/security/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({ ok: true, rules });

    const persisted = dbGetSetting<any[]>("security_rules", []);
    expect(persisted).toEqual(rules);

    const reload = await adminRequest("/api/security/rules");
    expect(reload.status).toBe(200);
    expect((await reload.json()).rules).toEqual(rules);
  });

  it("rejects duplicate IDs, malformed actions, and oversized rule lists", async () => {
    const invalidCases = [
      [
        { id: "duplicate", pattern: "one", action: "mask", description: "One", enabled: true },
        { id: "duplicate", pattern: "two", action: "block", description: "Two", enabled: true },
      ],
      [
        { id: "bad-action", pattern: "one", action: "allow", description: "Bad action", enabled: true },
      ],
      Array.from({ length: 101 }, (_, index) => ({
        id: `rule-${index}`,
        pattern: `pattern-${index}`,
        action: "mask",
        description: "Too many rules",
        enabled: true,
      })),
    ];

    for (const rules of invalidCases) {
      const response = await adminRequest("/api/security/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      expect(response.status).toBe(400);
    }

    expect(dbGetSetting("security_rules", null)).toBeNull();
  });

  it("rejects writes from disallowed hosts", async () => {
    const response = await app.request("http://example.com/api/security/rules", {
      method: "PUT",
      headers: {
        Host: "example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rules: [] }),
    });
    expect(response.status).toBe(403);
  });
});
