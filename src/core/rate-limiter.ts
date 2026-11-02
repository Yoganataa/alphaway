import type { EffectivePolicy } from "./policy";

const WINDOW_MS = 60_000;
const MAX_KEY_STATES = 10_000;

interface WindowBucket {
  second: number;
  requests: number;
  promptTokens: number;
}

interface KeyWindowState {
  windows: WindowBucket[];
  inFlight: number;
  quotaReservedTokens: number;
  quotaCommittedTokens: number;
  lastSeen: number;
}

export type PolicyLimitAxis = "rpm" | "tpm" | "concurrency" | "token_quota" | "capacity";

export interface PolicyGateResult {
  allowed: boolean;
  axis?: PolicyLimitAxis;
  retryAfterSeconds?: number;
  status?: 429 | 503;
  release: () => void;
  settleQuota: (actualTokens: number, authoritative?: boolean) => void;
}

const noRelease = () => {};
const noSettle = (_actualTokens: number, _authoritative?: boolean) => {};

function safeInteger(value: number): number {
  return Number.isSafeInteger(value) ? Math.max(0, value) : 0;
}

function prune(state: KeyWindowState, now: number): void {
  const cutoffSecond = Math.floor(now / 1000) - 60;
  while (state.windows.length && state.windows[0].second < cutoffSecond) {
    state.windows.shift();
  }
}

function totals(state: KeyWindowState): { requests: number; promptTokens: number } {
  let requests = 0;
  let promptTokens = 0;
  for (const bucket of state.windows) {
    requests += bucket.requests;
    promptTokens += bucket.promptTokens;
  }
  return { requests, promptTokens };
}

function retryAfterOldestBucket(state: KeyWindowState, now: number): number {
  const first = state.windows[0];
  if (!first) return 1;
  // Buckets are second-granularity and deliberately retain the boundary
  // bucket until it is certainly older than 60 seconds.
  return Math.max(1, Math.ceil(((first.second + 61) * 1000 - now) / 1000));
}

function addToCurrentBucket(state: KeyWindowState, now: number, requests: number, promptTokens: number): void {
  const second = Math.floor(now / 1000);
  const last = state.windows[state.windows.length - 1];
  if (last?.second === second) {
    last.requests += requests;
    last.promptTokens += promptTokens;
    return;
  }
  state.windows.push({ second, requests, promptTokens });
}

function promptTokenRetry(state: KeyWindowState, requested: number, limit: number, now: number): number {
  if (requested > limit) return 60;
  let excess = totals(state).promptTokens + requested - limit;
  for (const bucket of state.windows) {
    excess -= bucket.promptTokens;
    if (excess <= 0) {
      return Math.max(1, Math.ceil(((bucket.second + 61) * 1000 - now) / 1000));
    }
  }
  return 60;
}

class ManagedKeyRateLimiter {
  private readonly states = new Map<string, KeyWindowState>();
  private admittedSinceSweep = 0;

  acquire(
    keyId: string,
    policy: EffectivePolicy,
    promptTokens: number,
    now = Date.now(),
    quotaReservationTokens = promptTokens,
  ): PolicyGateResult {
    const rpm = Math.max(0, Math.trunc(policy.rpmLimit || 0));
    const tpm = Math.max(0, Math.trunc(policy.tpmLimit || 0));
    const concurrency = Math.max(0, Math.trunc(policy.concurrencyLimit || 0));
    const tokenQuota = Math.max(0, Math.trunc(policy.tokenQuota || 0));
    if (!rpm && !tpm && !concurrency && !tokenQuota) {
      return { allowed: true, release: noRelease, settleQuota: noSettle };
    }

    let state = this.states.get(keyId);
    if (!state) {
      this.sweepExpired(now);
      if (this.states.size >= MAX_KEY_STATES) {
        return { allowed: false, axis: "capacity", status: 503, retryAfterSeconds: 1, release: noRelease, settleQuota: noSettle };
      }
      state = { windows: [], inFlight: 0, quotaReservedTokens: 0, quotaCommittedTokens: 0, lastSeen: now };
      this.states.set(keyId, state);
    }

    prune(state, now);
    state.lastSeen = now;
    state.quotaCommittedTokens = Math.max(state.quotaCommittedTokens, safeInteger(policy.totalTokensUsed));
    const windowTotals = totals(state);
    const safePromptTokens = safeInteger(promptTokens);
    const safeQuotaReservation = safeInteger(quotaReservationTokens);

    if (
      tokenQuota > 0 &&
      state.quotaCommittedTokens + state.quotaReservedTokens + safeQuotaReservation > tokenQuota
    ) {
      return { allowed: false, axis: "token_quota", status: 429, release: noRelease, settleQuota: noSettle };
    }

    if (rpm > 0 && windowTotals.requests >= rpm) {
      return {
        allowed: false,
        axis: "rpm",
        status: 429,
        retryAfterSeconds: retryAfterOldestBucket(state, now),
        release: noRelease,
        settleQuota: noSettle,
      };
    }

    if (tpm > 0 && windowTotals.promptTokens + safePromptTokens > tpm) {
      return {
        allowed: false,
        axis: "tpm",
        status: 429,
        retryAfterSeconds: promptTokenRetry(state, safePromptTokens, tpm, now),
        release: noRelease,
        settleQuota: noSettle,
      };
    }

    if (concurrency > 0 && state.inFlight >= concurrency) {
      return { allowed: false, axis: "concurrency", status: 429, retryAfterSeconds: 1, release: noRelease, settleQuota: noSettle };
    }

    if (tokenQuota > 0) state.quotaReservedTokens += safeQuotaReservation;
    if (rpm > 0 || (tpm > 0 && safePromptTokens > 0)) {
      addToCurrentBucket(state, now, rpm > 0 ? 1 : 0, tpm > 0 ? safePromptTokens : 0);
    }
    if (concurrency > 0) state.inFlight += 1;

    let released = false;
    let quotaSettledTokens = 0;
    let quotaReservationSettled = false;
    let quotaSettledAuthoritatively = false;

    const settleQuota = (actualTokens: number, authoritative = false) => {
      if (tokenQuota <= 0) return;
      if (quotaSettledAuthoritatively && !authoritative) return;
      const nextActual = safeInteger(actualTokens);
      if (!quotaReservationSettled) {
        state!.quotaReservedTokens = Math.max(0, state!.quotaReservedTokens - safeQuotaReservation);
        quotaReservationSettled = true;
      }
      state!.quotaCommittedTokens += nextActual - quotaSettledTokens;
      quotaSettledTokens = nextActual;
      quotaSettledAuthoritatively = quotaSettledAuthoritatively || authoritative;
      state!.lastSeen = Date.now();
    };

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
    return { allowed: true, release, settleQuota };
  }

  private sweepExpired(now: number): void {
    for (const [keyId, state] of this.states) {
      prune(state, now);
      if (state.inFlight === 0 && state.windows.length === 0 && state.quotaReservedTokens === 0) {
        this.states.delete(keyId);
      }
    }
  }

  /** Test-only reset; production state remains bounded by key and window caps. */
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
  now?: number,
  quotaReservationTokens?: number,
): PolicyGateResult {
  return limiter.acquire(keyId, policy, promptTokens, now, quotaReservationTokens);
}

export function __clearManagedKeyRateLimiterForTests(): void {
  limiter.clearForTests();
}

export function __getManagedKeyRateLimiterStateCountForTests(): number {
  return limiter.getStateCountForTests();
}
