import { beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { adminHeaders, adminRequest } from "./helpers/admin";
import { issueAPIKey, listAPIKeys, revokeAPIKey, setAPIKeyPolicy } from "../src/core/api-keys";
import { recordRequestUsage } from "../src/core/usage-tracker";
import { createPlan, deletePlan, listPlans } from "../src/core/plans";
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


  it("rejects unknown Plan and key policy input fields", async () => {
    await adminHeaders();
    const invalidPlan = await adminRequest("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unexpected", description: "", rpmLimit: 0, tpmLimit: 0, concurrencyLimit: 0, tokenQuota: 0, allowedModels: [], maxTokens: 999 }),
    });
    expect(invalidPlan.status).toBe(400);

    const plan = createPlan({
      name: "Strict fields",
      description: "",
      rpmLimit: 0,
      tpmLimit: 0,
      concurrencyLimit: 0,
      tokenQuota: 0,
      allowedModels: [],
    });
    const key = issueAPIKey("Strict key");
    const invalidPolicy = await adminRequest("/api/keys/" + key.record.id + "/policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan.id, maxTokens: 123 }),
    });
    expect(invalidPolicy.status).toBe(400);
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


  it("attributes usage to the managed key and returns effective inherited policy metadata", () => {
    const plan = createPlan({
      name: "Metered",
      description: "",
      rpmLimit: 15,
      tpmLimit: 4000,
      concurrencyLimit: 3,
      tokenQuota: 25000,
      allowedModels: ["metered-*"],
    });
    const key = issueAPIKey("Metered key");
    setAPIKeyPolicy(key.record.id, { planId: plan.id });

    recordRequestUsage({
      protocol: "openai",
      model: "metered-model",
      provider: "opencode",
      status: 200,
      latencyMs: 4,
      promptTokens: 40,
      completionTokens: 10,
      clientApiKeyId: key.record.id,
    });

    const log = getDatabase().prepare("SELECT client_api_key_id, total_tokens FROM request_logs WHERE client_api_key_id = ? ORDER BY timestamp DESC LIMIT 1").get(key.record.id);
    expect(log.client_api_key_id).toBe(key.record.id);
    expect(log.total_tokens).toBe(50);

    const listed = listAPIKeys().find((item) => item.id === key.record.id)!;
    expect(listed.totalTokensUsed).toBe(50);
    expect(listed.planName).toBe("Metered");
    expect(listed.effectiveRpmLimit).toBe(15);
    expect(listed.effectiveTpmLimit).toBe(4000);
    expect(listed.effectiveConcurrencyLimit).toBe(3);
    expect(listed.effectiveTokenQuota).toBe(25000);
    expect(listed.effectiveAllowedModels).toEqual(["metered-*"]);
  });


  it("persists usage for an already-authenticated request after its key is revoked", () => {
    const plan = createPlan({
      name: "Revoked in-flight",
      description: "",
      rpmLimit: 0,
      tpmLimit: 0,
      concurrencyLimit: 1,
      tokenQuota: 1000,
      allowedModels: [],
    });
    const key = issueAPIKey("In-flight key");
    setAPIKeyPolicy(key.record.id, { planId: plan.id });
    expect(revokeAPIKey(key.record.id)).toBe(true);

    recordRequestUsage({
      protocol: "openai",
      model: "gpt-test",
      provider: "opencode",
      status: 200,
      latencyMs: 10,
      promptTokens: 30,
      completionTokens: 20,
      clientApiKeyId: key.record.id,
    });

    const stored = getDatabase().prepare(
      "SELECT status, total_tokens_used FROM api_keys WHERE id = ?"
    ).get(key.record.id);
    expect(stored.status).toBe("revoked");
    expect(stored.total_tokens_used).toBe(50);
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

    const legacyAliases = [
      { path: "/chat/completions", body: { model: "blocked-model", messages: [{ role: "user", content: "hello" }] } },
      { path: "/api/chat", body: { model: "blocked-model", messages: [{ role: "user", content: "hello" }] } },
      { path: "/messages", body: { model: "blocked-model", max_tokens: 64, messages: [{ role: "user", content: "hello" }] } },
      { path: "/responses", body: { model: "blocked-model", input: "hello" } },
      { path: "/response", body: { model: "blocked-model", input: "hello" } },
      { path: "/v1/response", body: { model: "blocked-model", input: "hello" } },
    ];
    for (const alias of legacyAliases) {
      const response = await app.request(alias.path, {
        method: "POST",
        headers: { Authorization: "Bearer " + modelKey.secret, "Content-Type": "application/json" },
        body: JSON.stringify(alias.body),
      });
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("model_not_allowed");
    }

    const rejectedUsage = getDatabase().prepare(
      "SELECT COUNT(*) AS count, SUM(total_tokens) AS tokens FROM request_logs WHERE client_api_key_id = ?"
    ).get(modelKey.record.id);
    expect(rejectedUsage.count).toBe(9);
    expect(rejectedUsage.tokens).toBe(0);


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
 
  it("fails closed when a persisted Plan or key model allowlist is malformed", () => {
    const plan = createPlan({
      name: "Corrupt policy",
      description: "",
      rpmLimit: 0,
      tpmLimit: 0,
      concurrencyLimit: 0,
      tokenQuota: 0,
      allowedModels: ["allowed-model"],
    });
    const planKey = issueAPIKey("Corrupt Plan policy");
    setAPIKeyPolicy(planKey.record.id, { planId: plan.id });
    getDatabase().prepare("UPDATE plans SET allowed_models = ? WHERE id = ?").run("{invalid-json", plan.id);
    expect(() => resolveEffectivePolicy(planKey.record.id)).toThrow("Stored model policy contains invalid JSON");
    expect(() => listPlans()).toThrow("Stored Plan model allowlist contains invalid JSON");

    const key = issueAPIKey("Corrupt key policy");
    setAPIKeyPolicy(key.record.id, { allowedModels: ["allowed-model"] });
    getDatabase().prepare("UPDATE api_keys SET allowed_models = ? WHERE id = ?").run("{invalid-json", key.record.id);
    expect(() => resolveEffectivePolicy(key.record.id)).toThrow("Stored model policy contains invalid JSON");
  });


  it("rejects non-text prompt parts when a managed key has TPM or token quota limits", async () => {
    const tpmPlan = createPlan({
      name: "TPM image guard",
      description: "",
      rpmLimit: 0,
      tpmLimit: 1000,
      concurrencyLimit: 0,
      tokenQuota: 0,
      allowedModels: [],
    });
    const tpmKey = issueAPIKey("TPM image guard");
    setAPIKeyPolicy(tpmKey.record.id, { planId: tpmPlan.id });

    const openaiImage = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + tpmKey.secret, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "unrestricted-model",
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] }],
      }),
    });
    expect(openaiImage.status).toBe(400);
    expect((await openaiImage.json()).error.code).toBe("multimodal_prompt_unmeterable");

    const quotaPlan = createPlan({
      name: "Token quota image guard",
      description: "",
      rpmLimit: 0,
      tpmLimit: 0,
      concurrencyLimit: 0,
      tokenQuota: 10000,
      allowedModels: [],
    });
    const quotaKey = issueAPIKey("Token quota image guard");
    setAPIKeyPolicy(quotaKey.record.id, { planId: quotaPlan.id });

    const anthropicImage = await app.request("/v1/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + quotaKey.secret, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "unrestricted-model",
        max_tokens: 64,
        messages: [{
          role: "user",
          content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" } }],
        }],
      }),
    });
    expect(anthropicImage.status).toBe(400);
    expect((await anthropicImage.json()).error.code).toBe("multimodal_prompt_unmeterable");
  });
});
