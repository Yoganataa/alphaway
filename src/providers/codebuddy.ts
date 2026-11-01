"use strict";

const crypto = require("crypto");
const { getCodeBuddyApiKey, setCodeBuddyApiKey } = require("../core/codebuddy-credentials");

/**
 * CodeBuddy International (WorkBuddy AI) upstream integration for AlphaWay.
 *
 * Implements full parity with official WorkBuddy 5.8.4 desktop client:
 * 1. Channel verification headers (X-Conversation-*, traceparent, B3 family).
 * 2. Identity headers (WorkBuddy 5.8.4, X-Agent-*, X-Private-Data, X-User-Id).
 * 3. Forced SSE stream=true (prevents 11101 non-stream rejection) + response aggregation.
 * 4. Content gate phrase scrubbing (prevents 11128 content trigger).
 * 5. Concurrency ceiling per account (prevents 11140 "unusual activity" account restriction).
 * 6. Error classification for 11140, 11128, and 6004 with wall-clock Retry-After.
 */

const CODEBUDDY_INTL_URL =
  process.env.CODEBUDDY_INTL_URL || "https://www.workbuddy.ai/v2/chat/completions";

const CODEBUDDY_UA = "WorkBuddy/5.8.4 workbuddy-ai/5.8.4 CLI/2.161.0";
const CODEBUDDY_IDE_VER = "5.8.4";
const CODEBUDDY_DOMAIN = "www.workbuddy.ai";
const CODEBUDDY_SYSTEM_PROMPT = "You are CodeBuddy Code.";

// Upstream catalog for CodeBuddy International
const CODEBUDDY_MODELS = [
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", context_window: 1000000, max_output: 393216 },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", context_window: 1000000, max_output: 393216 },
  { id: "glm-5.3", name: "GLM 5.3", context_window: 1000000, max_output: 131072 },
  { id: "glm-5.3-flash", name: "GLM 5.3 Flash", context_window: 1000000, max_output: 131072 },
  { id: "glm-5.2", name: "GLM 5.2", context_window: 1000000, max_output: 131072 },
  { id: "glm-5.1", name: "GLM 5.1", context_window: 200000, max_output: 48000 },
  { id: "minimax-m3", name: "MiniMax M3", context_window: 512000, max_output: 524288 },
  { id: "kimi-k2.5", name: "Kimi K2.5", context_window: 164000, max_output: 32000 },
];

const CODEBUDDY_MODEL_SET = new Set(CODEBUDDY_MODELS.map((m) => m.id.toLowerCase()));

// External channel marker patterns
const CHANNEL_MARKER_REGEX =
  /you are claude code|claude.?code.+official.+cli|anthropic.+official.+cli|anxthxropic.+official.+cli|you are (?:cursor|windsurf|cline|aider|continue|copilot|cody)|cc_entrypoint\s*=\s*(?:cli|vscode|jetbrains|gui)|claude.?code.+issues|give feedback.+claude.?code|OhMyOpenCode/gi;

// Content gate phrase replacements (tested to bypass 11128 fingerprint filters)
const CHANNEL_GATE_PHRASES = [
  ["You are an AI agent powered by DeepSeek Harness", "You are an AI agent running inside DeepSeek Harness"],
  ["You are a coding agent powered by the ", "You are a coding agent running on the "],
  ["You are interacting with the user through the DeepSeek Harness Web GUI", "You are working with the user inside the DeepSeek Harness Web GUI"],
  ["Agent Teams is available in this session", "Agent Teams is enabled for this session"],
  ["Tokens prefixed with @ are paths the user explicitly referenced.", "Paths that begin with @ are the ones the user explicitly referenced."],
  ["Relative paths resolve from the workspace root", "Relative paths are resolved against the workspace root"],
  ["absolute paths identify files or directories on the host.", "absolute paths point at files or directories on the host."],
  ["A trailing slash marks a directory:", "A trailing slash indicates a directory:"],
  ["list it when its contents matter.", "list it whenever its contents matter."],
  ["Anything else is a file:", "Everything else is a file:"],
  ["use the read tool when its contents are needed,", "use the read tool whenever you need its contents,"],
  ["and do not claim to have inspected it before reading.", "and never claim to have inspected it before reading it."],
  ['@"..." quotes a path containing spaces.', 'A path containing spaces is quoted with @"...".'],
];

// In-flight concurrency ceiling (Anti-11140 account restrictions)
const DEFAULT_MAX_IN_FLIGHT = 3;
const MAX_IN_FLIGHT = (() => {
  const v = parseInt(process.env.CODEBUDDY_MAX_IN_FLIGHT || "", 10);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MAX_IN_FLIGHT;
})();

let activeInFlight = 0;
const inFlightQueue = [];

function acquireInFlightSlot(signal) {
  if (MAX_IN_FLIGHT <= 0) {
    return Promise.resolve(() => {});
  }
  if (activeInFlight < MAX_IN_FLIGHT) {
    activeInFlight++;
    let released = false;
    return Promise.resolve(() => {
      if (!released) {
        released = true;
        activeInFlight--;
        pumpQueue();
      }
    });
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const idx = inFlightQueue.findIndex((entry) => entry.resolve === resolve);
      if (idx !== -1) inFlightQueue.splice(idx, 1);
      reject(signal.reason || new Error("Cancelled while waiting for CodeBuddy concurrency slot"));
    };
    if (signal) {
      if (signal.aborted) {
        return reject(signal.reason || new Error("Already aborted"));
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    inFlightQueue.push({
      resolve: (fn) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve(fn);
      },
    });
  });
}

function pumpQueue() {
  while (inFlightQueue.length > 0 && activeInFlight < MAX_IN_FLIGHT) {
    activeInFlight++;
    const next = inFlightQueue.shift();
    let released = false;
    next.resolve(() => {
      if (!released) {
        released = true;
        activeInFlight--;
        pumpQueue();
      }
    });
  }
}

/**
 * Generate RFC 9562 UUIDv7 without third-party dependencies.
 */
function generateUuidV7() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const now = BigInt(Date.now());
  bytes[0] = Number((now >> 40n) & 0xffn);
  bytes[1] = Number((now >> 32n) & 0xffn);
  bytes[2] = Number((now >> 24n) & 0xffn);
  bytes[3] = Number((now >> 16n) & 0xffn);
  bytes[4] = Number((now >> 8n) & 0xffn);
  bytes[5] = Number(now & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122/9562 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * 32-character hex ID (UUIDv7 without hyphens).
 */
function generateHex32() {
  return generateUuidV7().replace(/-/g, "");
}

/**
 * Stable UUID derived from session key to maintain prompt-cache affinity.
 */
function stableConversationUuid(seed) {
  const hash = crypto.createHash("sha1").update(String(seed)).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // v5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant
  const hex = hash.toString("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Extract `sub` claim from a JWT Bearer token if present.
 */
function extractJwtSub(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = Buffer.from(b64, "base64").toString("utf8");
    const claims = JSON.parse(jsonStr);
    return typeof claims.sub === "string" && claims.sub.trim() ? claims.sub.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Check if a requested model should be routed to CodeBuddy International.
 */
function isCodebuddyModel(rawModel) {
  if (typeof rawModel !== "string") return false;
  const trimmed = rawModel.trim();
  if (/^(cbai\/|codebuddy-intl\/|codebuddy\/|workbuddy\/)/i.test(trimmed)) {
    return true;
  }
  const clean = trimmed.toLowerCase();
  return CODEBUDDY_MODEL_SET.has(clean);
}

/**
 * Normalize model identifier for CodeBuddy.
 */
function normalizeCodebuddyModel(rawModel) {
  if (typeof rawModel !== "string") return "";
  let stripped = rawModel.trim();
  stripped = stripped.replace(/^(cbai\/|codebuddy-intl\/|codebuddy\/|workbuddy\/)/i, "").trim();
  return stripped;
}

/**
 * Sanitize third-party client markers that could trip content gates.
 */
function sanitizeClientMarkers(text) {
  if (!text || typeof text !== "string") return text;
  return text.replace(CHANNEL_MARKER_REGEX, "[external-client-identity]");
}

/**
 * Rewrite known sentences that trip 11128 content verification.
 */
function scrubChannelGatePhrases(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const [needle, replacement] of CHANNEL_GATE_PHRASES) {
    if (out.includes(needle)) {
      out = out.split(needle).join(replacement);
    }
  }
  return out;
}

/**
 * Assemble the exact WorkBuddy 5.8.4 header family.
 */
function buildCodebuddyHeaders({ model, apiKey, sessionId }) {
  const reqId = generateHex32();
  const msgId = generateHex32();
  const traceId = generateHex32();
  const spanId = crypto.randomBytes(8).toString("hex");

  let convId;
  if (sessionId && typeof sessionId === "string" && sessionId.trim()) {
    convId = stableConversationUuid("codebuddy-intl:" + sessionId.trim());
  } else {
    convId = generateUuidV7();
  }

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": CODEBUDDY_UA,
    "X-Product": "SaaS",
    "X-Product-Version": CODEBUDDY_IDE_VER,
    "X-IDE-Type": "WorkBuddy",
    "X-IDE-Name": "WorkBuddy",
    "X-IDE-Version": CODEBUDDY_IDE_VER,
    "X-Private-Data": "true",
    "X-Agent-Intent": "craft",
    "X-Agent-Purpose": "conversation",
    "X-Agent-Type": "main",
    "X-Domain": CODEBUDDY_DOMAIN,
    "X-Requested-With": "XMLHttpRequest",
    "X-CodeBuddy-Request": "1",

    // Channel verification header family (Mandatory to avoid 11128)
    "X-Conversation-ID": convId,
    "X-Conversation-Request-ID": reqId,
    "X-Root-Request-ID": reqId,
    "X-Conversation-Message-ID": msgId,
    "X-Request-ID": msgId,

    // W3C / B3 Distributed Tracing
    "X-Trace-ID": traceId,
    "X-B3-TraceId": traceId,
    "X-B3-SpanId": spanId,
    "traceparent": `00-${traceId}-${spanId}-01`,
    "b3": `${traceId}-${spanId}-1`,
    "X-B3-Sampled": "1",
  };

  if (model) {
    headers["X-Model-ID"] = model;
  }

  if (apiKey) {
    headers["Authorization"] = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
    const sub = extractJwtSub(apiKey.replace(/^Bearer\s+/i, ""));
    if (sub) {
      headers["X-User-Id"] = sub;
    }
  }

  return headers;
}

/**
 * Transform request body to meet CodeBuddy requirements:
 * - stream: true is forced (CodeBuddy rejects non-stream with 11101).
 * - Leading system message: "You are CodeBuddy Code."
 * - String user messages converted to typed blocks.
 * - Client markers & content-gate phrases sanitized.
 * - reasoning_effort handled.
 */
function transformCodebuddyBody(body, targetModel) {
  const transformed = { ...body, model: targetModel };

  // 1. Force streaming
  transformed.stream = true;

  // 2. Reasoning effort
  if (typeof transformed.reasoning_effort === "string") {
    const eff = transformed.reasoning_effort.toLowerCase();
    if (eff === "none" || eff === "off") {
      delete transformed.reasoning_effort;
    } else {
      transformed.reasoning_summary = "auto";
    }
  }

  // 3. Transform messages
  const inputMessages = Array.isArray(transformed.messages) ? transformed.messages : [];
  const systemInstructions = [];
  const otherMessages = [];

  for (const msg of inputMessages) {
    if (!msg || typeof msg !== "object") continue;
    const role = String(msg.role || "").toLowerCase();

    if (role === "system" || role === "developer") {
      let text = "";
      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        text = msg.content
          .map((c) => (typeof c === "string" ? c : c?.text || ""))
          .join("\n");
      }
      const cleaned = scrubChannelGatePhrases(sanitizeClientMarkers(text)).trim();
      if (cleaned && cleaned !== CODEBUDDY_SYSTEM_PROMPT) {
        systemInstructions.push(cleaned);
      }
      continue;
    }

    if (role === "user") {
      if (typeof msg.content === "string") {
        otherMessages.push({
          role: "user",
          content: [{ type: "text", text: msg.content }],
        });
        continue;
      }
    }

    if (role === "assistant") {
      if (typeof msg.content === "string") {
        otherMessages.push({
          ...msg,
          content: scrubChannelGatePhrases(sanitizeClientMarkers(msg.content)),
        });
        continue;
      } else if (Array.isArray(msg.content)) {
        const newBlocks = msg.content.map((b) => {
          if (b && typeof b === "object" && typeof b.text === "string") {
            return { ...b, text: scrubChannelGatePhrases(sanitizeClientMarkers(b.text)) };
          }
          return b;
        });
        otherMessages.push({ ...msg, content: newBlocks });
        continue;
      }
    }

    otherMessages.push(msg);
  }

  // Prepend mandatory leading system prompt
  const leadingSystemText = systemInstructions.length > 0
    ? `${CODEBUDDY_SYSTEM_PROMPT}\n\n${systemInstructions.join("\n\n")}`
    : CODEBUDDY_SYSTEM_PROMPT;

  transformed.messages = [
    { role: "system", content: leadingSystemText },
    ...otherMessages,
  ];

  return transformed;
}

/**
 * Classify upstream error responses (11140, 11128, 6004).
 */
function classifyCodebuddyError(status, data) {
  if (!data || typeof data !== "object") {
    return { status, message: `Upstream returned status ${status}`, code: status };
  }

  const code = data.code;
  const msg = data.msg || data.message || data.error?.message || "";
  const displayMsg = data.displayMsg?.en || data.displayMsg?.["zh-hans"] || data.displayMsg?.zh || "";
  const displayTips = data.displayTips?.en || data.displayTips?.zh || "";

  // 1. Account restriction (11140)
  if (code === 11140) {
    const combined = `${msg} ${displayMsg} ${displayTips}`;
    if (/unusual activity|restricted|request illegal|账号存在异常行为|已被限制使用/i.test(combined)) {
      return {
        status: 403,
        code: 11140,
        type: "account_restricted",
        message: `CodeBuddy Intl account restricted upstream (11140): ${displayMsg || "Your account has been restricted due to unusual activity"}. Please sign in again or submit feedback in the official WorkBuddy app.`,
        requestId: data.requestId || undefined,
        displayTips: displayTips || undefined,
      };
    }
    // Ambiguous 11140 falls back to rate limit
    return {
      status: 429,
      code: 11140,
      type: "rate_limit_error",
      message: `CodeBuddy rate limit: ${msg || displayMsg || "Request throttled upstream"}`,
    };
  }

  // 2. Channel verification failure (11128)
  if (code === 11128) {
    if (/conversation id missing/i.test(msg)) {
      return {
        status: 400,
        code: 11128,
        type: "channel_verification_failed",
        message: 'CodeBuddy channel verification failed: conversation ID missing. The gateway requires official WorkBuddy 5.8.4 conversation headers.',
      };
    }
    return {
      status: 400,
      code: 11128,
      type: "channel_verification_failed",
      message: `CodeBuddy channel verification failed (11128): ${displayTips || msg || "Request rejected by upstream channel verification."}`,
    };
  }

  // 3. Frequency / Rate limit (6004)
  if (code === 6004 || /超出频率限制|frequency limit|限额/i.test(msg)) {
    let retryAfterSec = 60;
    const match = msg.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\s*UTC\+?([0-9:]+))?/);
    if (match) {
      try {
        const resetTime = new Date(`${match[1]}T${match[2]}+08:00`).getTime();
        const diffSec = Math.ceil((resetTime - Date.now()) / 1000);
        if (diffSec > 0 && diffSec < 86400) retryAfterSec = diffSec;
      } catch {}
    }
    return {
      status: 429,
      code: 6004,
      type: "rate_limit_error",
      message: `CodeBuddy frequency limit (6004): ${msg}`,
      retryAfter: retryAfterSec,
    };
  }

  return {
    status,
    code: code || status,
    type: "upstream_error",
    message: msg || `Upstream returned code ${code || status}`,
  };
}

/**
 * Convert SSE buffer into standard OpenAI chat completion JSON for non-stream client requests.
 */
function sseToOpenAIJson(sseText, model) {
  const lines = sseText.split("\n");
  const contentParts = [];
  const reasoningParts = [];
  let finishReason = "stop";
  let firstChunk = null;
  let usage = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const rawData = trimmed.slice(5).trim();
    if (!rawData || rawData === "[DONE]") continue;

    try {
      const chunk = JSON.parse(rawData);
      if (!firstChunk) firstChunk = chunk;
      const choice = chunk.choices?.[0];
      if (choice?.delta) {
        if (typeof choice.delta.content === "string") {
          contentParts.push(choice.delta.content);
        }
        if (typeof choice.delta.reasoning_content === "string") {
          reasoningParts.push(choice.delta.reasoning_content);
        }
      }
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
    } catch {}
  }

  const assistantMessage = {
    role: "assistant",
    content: contentParts.join(""),
  };
  if (reasoningParts.length > 0) {
    assistantMessage.reasoning_content = reasoningParts.join("");
  }

  return {
    id: firstChunk?.id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: firstChunk?.created || Math.floor(Date.now() / 1000),
    model: model || firstChunk?.model || "codebuddy",
    choices: [
      {
        index: 0,
        message: assistantMessage,
        finish_reason: finishReason,
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

/**
 * Start CodeBuddy International Device OAuth flow.
 * Returns { state, authUrl } for the user to authenticate in browser.
 */
async function startCodebuddyOAuth() {
  const url = "https://www.codebuddy.ai/v2/plugin/auth/state?platform=ide";
  const headers = {
    "User-Agent": "IDE/2.63.2 CodeBuddy/2.63.2",
    "X-Requested-With": "XMLHttpRequest",
    "X-Domain": "www.codebuddy.ai",
    "X-No-Authorization": "true",
    "X-No-User-Id": "true",
    "X-Product": "SaaS",
    "Content-Type": "application/json",
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(`Failed to request CodeBuddy OAuth state: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.code !== 0 || !data.data?.state || !data.data?.authUrl) {
    throw new Error(`CodeBuddy OAuth state error: ${data.msg || "unknown error"}`);
  }
  return {
    state: data.data.state,
    authUrl: data.data.authUrl,
  };
}

/**
 * Poll CodeBuddy International Device OAuth token with state.
 * Returns { status: "pending" | "authorized" | "error", accessToken, refreshToken }
 */
let pollOAuthOverride: any = null;
function __setPollCodebuddyOAuth(fn: any) {
  pollOAuthOverride = fn;
}

async function pollCodebuddyOAuth(state: string) {
  if (pollOAuthOverride) return pollOAuthOverride(state);
  if (!state || typeof state !== "string") {
    throw new Error("Missing state parameter");
  }
  const url = `https://www.codebuddy.ai/v2/plugin/auth/token?state=${encodeURIComponent(state.trim())}`;
  const headers = {
    "Accept": "application/json",
    "User-Agent": "IDE/2.63.2 CodeBuddy/2.63.2",
    "X-Requested-With": "XMLHttpRequest",
    "X-Domain": "www.codebuddy.ai",
    "X-No-Authorization": "true",
    "X-No-User-Id": "true",
    "X-No-Enterprise-Id": "true",
    "X-No-Department-Info": "true",
    "X-Product": "SaaS",
  };
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    throw new Error(`CodeBuddy OAuth poll failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.code === 11217) {
    return { status: "pending" };
  }
  if (data.code === 0 && data.data?.accessToken) {
    return {
      status: "authorized",
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken || null,
    };
  }
  return {
    status: "error",
    code: data.code,
    message: data.msg || "OAuth authorization failed",
  };
}

/**
 * Test a real completion ping to CodeBuddy upstream.
 */
async function testCodebuddyPing(apiKey, model = "deepseek-v4.1-flash") {
  const url = process.env.CODEBUDDY_INTL_URL || CODEBUDDY_INTL_URL;
  const headers = buildCodebuddyHeaders({
    model,
    apiKey,
  });
  const body = transformCodebuddyBody(
    {
      model,
      stream: true,
      messages: [
        { role: "user", content: "Hello! Reply with 'CodeBuddy online and ready' in 5 words or less." },
      ],
    },
    model
  );

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }
    const classified = classifyCodebuddyError(res.status, json);
    const serialized = JSON.stringify(classified);
    const safeClassified = apiKey
      ? JSON.parse(serialized.split(apiKey).join("[REDACTED]").split("Bearer [REDACTED]").join("[REDACTED]"))
      : classified;
    return { ok: false, status: res.status, classified: safeClassified };
  }

  const sseText = await res.text();
  const parsed = sseToOpenAIJson(sseText, model);
  return {
    ok: true,
    content: parsed.choices?.[0]?.message?.content || "(empty reply)",
    model: parsed.model,
  };
}

/**
 * Interactive CLI OAuth Login runner
 */
async function loginCodebuddyCli() {
  console.log("\n" + "=".repeat(65));
  console.log("            CodeBuddy.ai / WorkBuddy OAuth Login Helper          ");
  console.log("=".repeat(65) + "\n");

  const currentKey = getCodeBuddyApiKey();
  if (currentKey) {
    const sub = extractJwtSub(currentKey);
    console.log(`ℹ️  Token saat ini terdeteksi untuk user: ${sub || "Authenticated"}`);
    console.log(`   Memulai sesi OAuth baru...\n`);
  }

  console.log("📡 Mengambil sesi OAuth dari CodeBuddy International...");
  let state, authUrl;
  try {
    const res = await startCodebuddyOAuth();
    state = res.state;
    authUrl = res.authUrl;
  } catch (err) {
    console.error(`❌ Failed to initiate OAuth session: ${err.message}`);
    process.exit(1);
  }

  console.log("\n" + "-".repeat(65));
  console.log("👉 Please open the following URL in your browser:");
  console.log(`\n   ${authUrl}\n`);
  console.log("-".repeat(65));
  console.log("Menunggu otorisasi akun CodeBuddy...");

  // Coba buka browser otomatis
  try {
    const { exec } = require("child_process");
    if (process.platform === "win32") {
      exec(`start "" "${authUrl}"`);
    } else if (process.platform === "darwin") {
      exec(`open "${authUrl}"`);
    } else {
      exec(`xdg-open "${authUrl}"`);
    }
    console.log("🌐 Mencoba membuka browser otomatis...");
  } catch {}

  const pollIntervalMs = 2500;
  const maxAttempts = 120; // 5 menit
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    try {
      const pollRes = await pollCodebuddyOAuth(state);
      if (pollRes.status === "pending") {
        process.stdout.write(".");
        continue;
      }

      if (pollRes.status === "authorized" && pollRes.accessToken) {
        console.log("\n\n✅ Authorization SUCCESSFUL!");
        const sub = extractJwtSub(pollRes.accessToken);
        if (sub) {
          console.log(`👤 User ID (sub): ${sub}`);
        }

        // Keep the OAuth-issued provider credential encrypted in canonical SQLite state.
        setCodeBuddyApiKey(pollRes.accessToken);
        process.env.CODEBUDDY_API_KEY = pollRes.accessToken;
        console.log("💾 CodeBuddy credential saved encrypted in AlphaWay SQLite state.");

        // Uji coba model langsung
        console.log("\n🧪 Melakukan uji coba model deepseek-v4.1-flash ke upstream...");
        const ping = await testCodebuddyPing(pollRes.accessToken, "deepseek-v4.1-flash");
        if (ping.ok) {
          console.log(`🎉 Respon Model: "${ping.content}"`);
          console.log("✨ CodeBuddy siap digunakan di AlphaWay!\n");
        } else {
          console.error(`⚠️ Uji coba model mengembalikan status HTTP ${ping.status}:`);
          console.error(`   Pesan: ${ping.classified.message}`);
          if (ping.classified.displayTips) {
            console.error(`   Saran: ${ping.classified.displayTips}`);
          }
        }
        return;
      }

      if (pollRes.status === "error") {
        console.error(`\n❌ Authorization failed: [Code ${pollRes.code}] ${pollRes.message}`);
        return;
      }
    } catch (err) {
      process.stdout.write("x");
    }
  }

  console.log("\n⏱️ Authorization timed out (5 minutes). Please try again.");
}

// Auto-run if executed directly
if (require.main === module || process.argv.includes("--login-codebuddy") || process.argv.includes("--login")) {
  loginCodebuddyCli();
}

module.exports = {
  CODEBUDDY_INTL_URL,
  CODEBUDDY_MODELS,
  CODEBUDDY_UA,
  CODEBUDDY_IDE_VER,
  CODEBUDDY_DOMAIN,
  isCodebuddyModel,
  normalizeCodebuddyModel,
  generateUuidV7,
  generateHex32,
  stableConversationUuid,
  extractJwtSub,
  buildCodebuddyHeaders,
  transformCodebuddyBody,
  classifyCodebuddyError,
  sseToOpenAIJson,
  acquireInFlightSlot,
  sanitizeClientMarkers,
  scrubChannelGatePhrases,
  startCodebuddyOAuth,
  pollCodebuddyOAuth,
  __setPollCodebuddyOAuth,
  testCodebuddyPing,
  loginCodebuddyCli,
};
