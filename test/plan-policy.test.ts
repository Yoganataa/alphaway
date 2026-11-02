import { beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { adminHeaders, adminRequest } from "./helpers/admin";
import { issueAPIKey, setAPIKeyPolicy } from "../src/core/api-keys";
import { createPlan, deletePlan, listPlans, updatePlan } from "../src/core/plans";
import { resolveEffectivePolicy, isModelAllowedByPolicy } from "../src/core/policy";
import { getDatabase } from "../src/core/database";

describe("Plan management and effective managed-key policy", () => {
  beforeEach(() => {
    const db = getDatabase();
    db.prepare("DELETE FROM api_keys").run();
    db.prepare("DELETE FROM plans").run();
  });

  it("creates, lists, updates, and deletes Plans through administrator routes", async () => {
    await adminHeaders();
    const created = await adminRequest("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Starter",
        description: "Low-volume plan",
        rpmLimit: 30,
        tpmLimit: 12000,
        concurrencyLimit: 2,
        tokenQuota: 100000,
        allowedModels: ["gpt-4.1-mini", "claude-3-5-*"],
      }),
    });
    expect(created.status).toBe(201);
    const plan = (await created.json()).plan;
    expect(plan.name).toBe("Starter");
    expect(plan.rpmLimit).toBe(30);
    expect(plan.tokenQuota).toBe(100000);

    const list = await adminRequest("/api/plans");
    expect(list.status).toBe(200);
    expect((await list.json()).plans.map((item: any) => item.id)).toContain(plan.id);

    const updated = await adminRequest("/api/plans/" + plan.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rpmLimit: 60, description: "Updated plan" }),
    });
    expect(updated.status).toBe(200);
    const next = (await updated.json()).plan;
    expect(next.rpmLimit).toBe(60);
    expect(next.tpmLimit).toBe(12000);
    expect(next.tokenQuota).toBe(100000);
    expect(next.description).toBe("Updated plan");

    const deleted = await adminRequest("/api/plans/" + plan.id, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    expect((await adminRequest("/api/plans")).status).toBe(200);
    expect(listPlans()).toHaveLength(0);
  });

  it("rejects invalid Plan limits, malformed model patterns, and duplicate names", async () => {
    await adminHeaders();
    const invalidLimit = await adminRequest("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Invalid", rpmLimit: "10" }),
    });
    expect(invalidLimit.status).toBe(400);

    const invalidWildcard = await adminRequest("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Invalid Wildcard", allowedModels: ["*"] }),
    });
    expect(invalidWildcard.status).toBe(400);

    const input = { name: "Duplicate", description: "", rpmLimit: 0, tpmLimit: 0, concurrencyLimit: 0, tokenQuota: 0, allowedModels: [] };
    expect((await adminRequest("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).status).toBe(201);
    expect((await adminRequest("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).status).toBe(400);
  });

  it("does not delete a Plan while managed keys are assigned to it", async () => {
    await adminHeaders();
    const plan = createPlan({
      name: "Assigned",
      description: "",
      rpmLimit: 10,
      tpmLimit: 5000,
      concurrencyLimit: 1,
      tokenQuota: 50000,
      allowedModels: [],
    });
    const key = issueAPIKey("Assigned key");
    expect(setAPIKeyPolicy(key.record.id, { planId: plan.id })?.planId).toBe(plan.id);

    const denied = await adminRequest("/api/plans/" + plan.id, { method: "DELETE" });
    expect(denied.status).toBe(409);
    expect((await denied.json()).assignedKeyCount).toBe(1);

    setAPIKeyPolicy(key.record.id, { planId: null });
    expect(deletePlan(plan.id)).toEqual({ deleted: true, assignedKeyCount: 0 });
  });

  it("resolves per-key overrides over Plan values and treats null as inheritance", () => {
    const plan = createPlan({
      name: "Policy",
      description: "",
      rpmLimit: 20,
      tpmLimit: 9000,
      concurrencyLimit: 2,
      tokenQuota: 100000,
      allowedModels: ["gpt-4.1-*", "claude-3-5-sonnet"],
    });
    const key = issueAPIKey("Policy key");
    expect(setAPIKeyPolicy(key.record.id, { planId: plan.id })).not.toBeNull();

    const inherited = resolveEffectivePolicy(key.record.id)!;
    expect(inherited.rpmLimit).toBe(20);
    expect(inherited.tpmLimit).toBe(9000);
    expect(inherited.concurrencyLimit).toBe(2);
    expect(inherited.tokenQuota).toBe(100000);
    expect(isModelAllowedByPolicy(inherited, "gpt-4.1-mini")).toBe(true);
    expect(isModelAllowedByPolicy(inherited, "gpt-4o")).toBe(false);

    setAPIKeyPolicy(key.record.id, { rateLimitRpm: 0, tokenQuota: 500, allowedModels: ["custom-*"] });
    const overridden = resolveEffectivePolicy(key.record.id)!;
    expect(overridden.rpmLimit).toBe(0);
    expect(overridden.tpmLimit).toBe(9000);
    expect(overridden.tokenQuota).toBe(500);
    expect(isModelAllowedByPolicy(overridden, "custom-model")).toBe(true);
    expect(isModelAllowedByPolicy(overridden, "gpt-4.1-mini")).toBe(false);

    setAPIKeyPolicy(key.record.id, { rateLimitRpm: null, allowedModels: null });
    const inheritedAgain = resolveEffectivePolicy(key.record.id)!;
    expect(inheritedAgain.rpmLimit).toBe(20);
    expect(inheritedAgain.allowedModels).toContain("gpt-4.1-*");
  });

  it("keeps unassigned managed keys unrestricted and does not assign a default Plan", () => {
    const key = issueAPIKey("Unassigned");
    const policy = resolveEffectivePolicy(key.record.id)!;
    expect(policy.planId).toBeNull();
    expect(policy.rpmLimit).toBe(0);
    expect(policy.tpmLimit).toBe(0);
    expect(policy.concurrencyLimit).toBe(0);
    expect(policy.tokenQuota).toBe(0);
    expect(policy.allowedModels).toEqual([]);
  });

  it("rejects model and token-quota violations before dispatch in all three protocols", async () => {
    const modelPlan = createPlan({
      name: "Model allowlist",
      description: "",
      rpmLimit: 0,
      tpmLimit: 0,
      concurrencyLimit: 0,
      tokenQuota: 0,
      allowedModels: ["allowed-model"],
    });
    const modelKey = issueAPIKey("Model restricted");
    setAPIKeyPolicy(modelKey.record.id, { planId: modelPlan.id });

    const openaiModel = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + modelKey.secret, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "blocked-model", messages: [{ role: "user", content: "hello" }] }),
    });
    expect(openaiModel.status).toBe(403);
    expect((await openaiModel.json()).error.code).toBe("model_not_allowed");

    const anthropicModel = await app.request("/v1/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + modelKey.secret, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "blocked-model", max_tokens: 64, messages: [{ role: "user", content: "hello" }] }),
    });
    expect(anthropicModel.status).toBe(403);
    expect((await anthropicModel.json()).error.code).toBe("model_not_allowed");

    const responsesModel = await app.request("/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + modelKey.secret, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "blocked-model", input: "hello" }),
    });
    expect(responsesModel.status).toBe(403);
    expect((await responsesModel.json()).error.code).toBe("model_not_allowed");

    const quotaKey = issueAPIKey("Quota restricted");
    setAPIKeyPolicy(quotaKey.record.id, { tokenQuota: 1 });
    const largePrompt = "x".repeat(256);
    const quotaResponses = await Promise.all([
      app.request("/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + quotaKey.secret, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "quota-test-model", messages: [{ role: "user", content: largePrompt }] }),
      }),
      app.request("/v1/messages", {
        method: "POST",
        headers: { Authorization: "Bearer " + quotaKey.secret, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "quota-test-model", max_tokens: 64, messages: [{ role: "user", content: largePrompt }] }),
      }),
      app.request("/v1/responses", {
        method: "POST",
        headers: { Authorization: "Bearer " + quotaKey.secret, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "quota-test-model", input: largePrompt }),
      }),
    ]);
    for (const response of quotaResponses) {
      expect(response.status).toBe(429);
      expect((await response.json()).error.code).toBe("token_quota_exceeded");
    }
  });
});
