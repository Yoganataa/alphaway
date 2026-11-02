import type { EffectivePolicy } from "./policy";

const WINDOW_MS = 60_000;
const MAX_KEY_STATES = 10_000;

interface TokenEvent {
  at: number;
  tokens: number;
}

interface KeyWindowState {
  requests: number[];
  promptTokens: TokenEvent[];
  inFlight: number;
  lastSeen: number;
}

export type PolicyLimitAxis = "rpm" | "tpm" | "concurrency" | "capacity";

export interface PolicyGateResult {
  allowed: boolean;
  axis?: PolicyLimitAxis;
  retryAfterSeconds?: number;
  status?: 429 | 503;
  release: () => void;
}

const noRelease = () => {};

function prune(state: KeyWindowState, now: number): void {
  const cutoff = now - WINDOW_MS;
  while (state.requests.length && state.requests[0] <= cutoff) state.requests.shift();
  while (state.promptTokens.length && state.promptTokens[0].at <= cutoff) state.promptTokens.shift();
}

function oldestRequestRetry(state: KeyWindowState, now: number): number {
  if (!state.requests.length) return 1;
  return Math.max(1, Math.ceil((state.requests[0] + WINDOW_MS - now) / 1000));
}

function tokenRetry(state: KeyWindowState, requested: number, limit: number, now: number): number {
  if (requested > limit) return 60;
  let remaining = state.promptTokens.reduce((sum, event) => sum + event.tokens, 0) + requested - limit;
  for (const event of state.promptTokens) {
    remaining -= event.tokens;
    if (remaining <= 0) return Math.max(1, Math.ceil((event.at + WINDOW_MS - now) / 1000));
  }
  return 60;
}

class ManagedKeyRateLimiter {
  private readonly states = new Map<string, KeyWindowState>();
  private admittedSinceSweep = 0;

  acquire(keyId: string, policy: EffectivePolicy, promptTokens: number, now = Date.now()): PolicyGateResult {
    const rpm = Math.max(0, Math.trunc(policy.rpmLimit || 0));
    const tpm = Math.max(0, Math.trunc(policy.tpmLimit || 0));
    const concurrency = Math.max(0, Math.trunc(policy.concurrencyLimit || 0));
    if (!rpm && !tpm && !concurrency) return { allowed: true, release: noRelease };

    let state = this.states.get(keyId);
    if (!state) {
      this.sweepExpired(now);
      if (this.states.size >= MAX_KEY_STATES) {
        return { allowed: false, axis: "capacity", status: 503, retryAfterSeconds: 1, release: noRelease };
      }
      state = { requests: [], promptTokens: [], inFlight: 0, lastSeen: now };
      this.states.set(keyId, state);
    }
    prune(state, now);
    state.lastSeen = now;

    if (rpm > 0 && state.requests.length >= rpm) {
      return { allowed: false, axis: "rpm", status: 429, retryAfterSeconds: oldestRequestRetry(state, now), release: noRelease };
    }

    const safePromptTokens = Number.isSafeInteger(promptTokens) ? Math.max(0, promptTokens) : 0;
    if (tpm > 0) {
      const used = state.promptTokens.reduce((sum, event) => sum + event.tokens, 0);
      if (used + safePromptTokens > tpm) {
        return { allowed: false, axis: "tpm", status: 429, retryAfterSeconds: tokenRetry(state, safePromptTokens, tpm, now), release: noRelease };
      }
    }

    if (concurrency > 0 && state.inFlight >= concurrency) {
      return { allowed: false, axis: "concurrency", status: 429, retryAfterSeconds: 1, release: noRelease };
    }

    if (rpm > 0) state.requests.push(now);
    if (tpm > 0 && safePromptTokens > 0) state.promptTokens.push({ at: now, tokens: safePromptTokens });
    if (concurrency > 0) state.inFlight += 1;

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (concurrency > 0) state!.inFlight = Math.max(0, state!.inFlight - 1);
      state!.lastSeen = Date.now();
    };

    this.admittedSinceSweep += 1;
    if (this.admittedSinceSweep >= 128) {
      this.admittedSinceSweep = 0;
      this.sweepExpired(Date.now());
    }
    return { allowed: true, release };
  }

  private sweepExpired(now: number): void {
    for (const [keyId, state] of this.states) {
      prune(state, now);
      if (state.inFlight === 0 && state.requests.length === 0 && state.promptTokens.length === 0) {
        this.states.delete(keyId);
      }
    }
  }

  /** Test-only reset; production state is process-local and bounded. */
  clearForTests(): void {
    this.states.clear();
    this.admittedSinceSweep = 0;
  }

  /** Test-only inspection to assert bounded state behavior. */
  getStateCountForTests(): number {
    return this.states.size;
  }
}

const limiter = new ManagedKeyRateLimiter();

export function acquireManagedKeyRequest(
  keyId: string,
  policy: EffectivePolicy,
  promptTokens: number,
  now?: number
): PolicyGateResult {
  return limiter.acquire(keyId, policy, promptTokens, now);
}

export function __clearManagedKeyRateLimiterForTests(): void {
  limiter.clearForTests();
}

export function __getManagedKeyRateLimiterStateCountForTests(): number {
  return limiter.getStateCountForTests();
}
