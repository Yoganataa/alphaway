import { beforeEach, describe, expect, it } from "bun:test";
import {
  __clearManagedKeyRateLimiterForTests,
  __getManagedKeyRateLimiterStateCountForTests,
  acquireManagedKeyRequest,
} from "../src/core/rate-limiter";
import type { EffectivePolicy } from "../src/core/policy";

function policy(overrides: Partial<EffectivePolicy> = {}): EffectivePolicy {
  return {
    keyId: "key-test",
    planId: "plan-test",
    planName: "Test",
    rpmLimit: 0,
    tpmLimit: 0,
    concurrencyLimit: 0,
    tokenQuota: 0,
    totalTokensUsed: 0,
    allowedModels: [],
    ...overrides,
  };
}

describe("managed-key sliding-window limiter", () => {
  beforeEach(() => __clearManagedKeyRateLimiterForTests());

  it("enforces RPM over a rolling 60-second window and reports Retry-After", () => {
    const first = acquireManagedKeyRequest("rpm-key", policy({ rpmLimit: 1 }), 0, 10_000);
    expect(first.allowed).toBe(true);

    const blocked = acquireManagedKeyRequest("rpm-key", policy({ rpmLimit: 1 }), 0, 10_001);
    expect(blocked.allowed).toBe(false);
    expect(blocked.axis).toBe("rpm");
    expect(blocked.status).toBe(429);
    expect(blocked.retryAfterSeconds).toBe(60);

    const afterWindow = acquireManagedKeyRequest("rpm-key", policy({ rpmLimit: 1 }), 0, 70_001);
    expect(afterWindow.allowed).toBe(true);
  });

  it("enforces prompt TPM and rejects a single prompt larger than the window", () => {
    const first = acquireManagedKeyRequest("tpm-key", policy({ tpmLimit: 100 }), 60, 5_000);
    expect(first.allowed).toBe(true);

    const blocked = acquireManagedKeyRequest("tpm-key", policy({ tpmLimit: 100 }), 50, 5_001);
    expect(blocked.allowed).toBe(false);
    expect(blocked.axis).toBe("tpm");
    expect(blocked.status).toBe(429);

    const oversized = acquireManagedKeyRequest("large-prompt", policy({ tpmLimit: 100 }), 101, 5_001);
    expect(oversized.allowed).toBe(false);
    expect(oversized.axis).toBe("tpm");
    expect(oversized.retryAfterSeconds).toBe(60);
  });

  it("holds concurrency until release and makes release idempotent", () => {
    const first = acquireManagedKeyRequest("concurrency-key", policy({ concurrencyLimit: 1 }), 0, 100);
    expect(first.allowed).toBe(true);

    const blocked = acquireManagedKeyRequest("concurrency-key", policy({ concurrencyLimit: 1 }), 0, 101);
    expect(blocked.allowed).toBe(false);
    expect(blocked.axis).toBe("concurrency");

    first.release();
    first.release();
    const second = acquireManagedKeyRequest("concurrency-key", policy({ concurrencyLimit: 1 }), 0, 102);
    expect(second.allowed).toBe(true);
    second.release();
  });


  it("reserves lifetime token quota across concurrent requests and settles actual usage", () => {
    const p = policy({ tokenQuota: 100, totalTokensUsed: 0 });
    const first = acquireManagedKeyRequest("quota-key", p, 40, 1_000, 80);
    expect(first.allowed).toBe(true);

    const blocked = acquireManagedKeyRequest("quota-key", p, 10, 1_001, 30);
    expect(blocked.allowed).toBe(false);
    expect(blocked.axis).toBe("token_quota");
    expect(blocked.status).toBe(429);

    first.settleQuota(55, true);
    first.release();
    const remaining = acquireManagedKeyRequest(
      "quota-key",
      policy({ tokenQuota: 100, totalTokensUsed: 55 }),
      20,
      1_002,
      45
    );
    expect(remaining.allowed).toBe(true);
    remaining.settleQuota(42, true);
    remaining.release();
  });

  it("bounds per-key limiter state and fails closed at capacity", () => {
    const releases: Array<() => void> = [];
    const p = policy({ concurrencyLimit: 1 });
    for (let index = 0; index < 10_000; index += 1) {
      const result = acquireManagedKeyRequest("key-" + index, p, 0, 1_000);
      expect(result.allowed).toBe(true);
      releases.push(result.release);
    }
    expect(__getManagedKeyRateLimiterStateCountForTests()).toBe(10_000);

    const overflow = acquireManagedKeyRequest("overflow-key", p, 0, 1_000);
    expect(overflow.allowed).toBe(false);
    expect(overflow.axis).toBe("capacity");
    expect(overflow.status).toBe(503);

    for (const release of releases) release();
  });
});
