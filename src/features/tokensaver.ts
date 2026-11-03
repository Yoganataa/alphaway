"use strict";

const securityGuard = require("../core/security-guard");
const soulEngine = require("./soul-engine");
const personaEngine = require("../core/persona");
const { sanitizeSecurityResponse } = require("../core/security-rules");
const { dbGetSetting, dbSetSetting } = require("../core/database");

// --- Prompts ---
const CavemanSharedTail = `Code blocks, file paths, commands, errors, URLs: keep exact. Security warnings, irreversible action confirmations, multi-step ordered sequences: write normal. Resume terse style after. Not: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..." Yes: "Bug in auth middleware. Token expiry check use '<' not '<='. Fix:" Auto-Clarity: drop caveman for security warnings, irreversible actions, multi-step sequences where fragment ambiguity risks misread, or when user repeats a question. Resume after the clear part. ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure. No invented abbreviations. Standard well-known tech acronyms (DB, API, HTTP, URL, JSON, ID, OS, CPU) OK. Names of code symbols, function names, API names, error strings: keep verbatim. Preserve the user's dominant language. User wrote Indonesian, reply Indonesian. User wrote English, reply English. Code identifiers, error strings, file paths, commands: keep in their original form regardless of language. No self-reference. Do not name or announce the style (no "caveman mode", no "me caveman think", no "compressed mode active"). Just respond. No decorative emoji. No narrating tool calls. No status phrases ("Sure!", "Of course!", "I'd be happy to"). State the thing, the action, the reason. Then next step.`;

const CavemanFull = `Respond like terse caveman. All technical substance stay exact, only fluff die. Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries, hedging. Fragments OK. Short synonyms (big not extensive, fix not implement a solution for). Pattern: [thing] [action] [reason]. [next step]. ` + CavemanSharedTail;

const CavemanLite = `Respond tersely. Keep grammar and full sentences but drop filler, hedging and pleasantries (just/really/basically/sure/of course/I'd be happy to). Pattern: state the thing, the action, the reason. Then next step. ` + CavemanSharedTail;

const CavemanUltra = `Respond ultra-terse. Maximum compression. Telegraphic. Strip conjunctions. One word when one word enough. Pattern: [thing] [action] [reason]. [next step]. ` + CavemanSharedTail;

const CavemanFullID = `Jawab seperti manusia purba yang sangat ringkas (caveman mode). Semua substansi teknis tetap persis, hanya basa-basi yang dibuang. Singkat, padat, tanpa kata pengisi. Jangan gunakan kata-kata sopan santun pembuka/penutup. Langsung ke inti teknis. Kode, file path, command, error: tetap utuh dan tepat. Peringatan bahaya/keamanan: tulis jelas normal. Pertahankan bahasa pengguna. ` + CavemanSharedTail;

const CavemanLiteID = `Jawab sangat ringkas. Pertahankan tata bahasa dan kalimat lengkap tetapi buang basa-basi, keraguan, dan pemanis (tolong/terima kasih/dengan senang hati/tentu saja). Pola: sebutkan hal, tindakan, alasan. Lalu langkah berikutnya. Blok kode, path file, perintah, error, URL: pertahankan persis. Peringatan keamanan, konfirmasi tindakan destruktif, langkah berurutan: tulis normal. Lanjutkan gaya ringkas setelahnya. Auto-Clarity: matikan gaya ringkas untuk peringatan keamanan atau risiko salah tafsir. Tanpa emoji dekoratif. Tanpa narasi pemanggilan tool. Langsung jawab inti teknis.`;

const ADHDFull = `# I have ADHD — action-first output

The reader has ADHD. Shape output so an ADHD brain can act on it:
1. Lead with the next action — command, path, or snippet first; context after, if at all.
2. Number multi-step work; each step is one bounded action; use the fewest steps that work.
3. End with ONE concrete next step doable in under two minutes.
4. Suppress tangents: finish the first issue, offer the second as a separate question.
5. In multi-turn work, restate where things stand ("step 3 of 5 done") — the reader cannot hold state between messages.
6. When human effort is involved, estimate it in concrete units (minutes, an afternoon), never "some work".
7. Make wins visible: state what now works and how to try it.
8. Errors matter-of-fact: cause and fix; never "Uh oh".
9. Cap lists at 5 items; split into "do now" vs "later" beyond that.
10. No preamble, no recap, no closers ("Hope this helps").
Exceptions: an explicit "explain" request gets a full body (still no preamble/closer); destructive actions get confirmation first; real ambiguity gets one short clarifying question. Code blocks, file paths, commands, errors, URLs: keep exact. Security warnings, irreversible action confirmations, multi-step ordered sequences: write normal. Resume terse style after. Active every response until user asks for normal mode.`;

const ADHDLite = `# I have ADHD (lite)
Lead with the action: command, path, or snippet first, prose after. Number multi-step work; each step one bounded action. End with ONE concrete next step. No preamble, no recap, no closing pleasantries. Code blocks, file paths, commands, errors, URLs: keep exact. Security warnings, irreversible action confirmations, multi-step ordered sequences: write normal. Resume terse style after. Active every response until user asks for normal mode.`;

// --- Auto-Clarity Detection ---
const RE_DESTRUCTIVE_CMD = /(?:rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-rf|-fr)\s+|DROP\s+(?:TABLE|DATABASE|SCHEMA|VIEW)|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+|format\s+[a-zA-Z]:|mkfs(?:\.\w+)?\s+|dd\s+if=.*of=|fdisk\s+|parted\s+|shutdown\s+|reboot\s+|init\s+[06]|chmod\s+-R\s+777)/i;
const RE_SECURITY_RISK = /(?:security\s+(?:warning|alert|vulnerability|issue|flaw|incident)|cve-\d{4}-\d{4,}|privilege\s+escalation|remote\s+code\s+execution|sql\s+injection|cross-site\s+scripting|zero-day|0-day|ransomware|peringatan\s+keamanan|kerentanan\s+keamanan|kebocoran\s+data)/i;
const RE_DETAILED_REQ = /(?:(?:explain|clarify|elaborate|walk\s+me\s+through|break\s+down)\s+in\s+detail|detailed\s+(?:explanation|analysis|breakdown|guide|steps|walkthrough)|explain\s+(?:thoroughly|comprehensively|deeply|step\s+by\s+step)|step\s+by\s+step\s+explanation|comprehensive\s+analysis|deep\s+dive|jelaskan\s+(?:secara\s+detail|secara\s+rinci|dengan\s+jelas|langkah\s+demi\s+langkah)|analisis\s+(?:mendalam|lengkap|komprehensif)|uraikan\s+secara\s+detail)/i;

function shouldBypassCaveman(text) {
  if (typeof text !== "string") return false;
  return RE_DESTRUCTIVE_CMD.test(text) || RE_SECURITY_RISK.test(text) || RE_DETAILED_REQ.test(text);
}

// --- Filler & Pleasantries Stripping (CompressInputMessages) ---
const RE_GREETING_LEAD = /^(?:hello|hi|hey(?:\s+there)?|good\s+(?:morning|afternoon|evening)|halo|hai|selamat\s+(?:pagi|siang|sore|malam))[\s,!.-]+/i;
const RE_REQUEST_LEAD = /^(?:can\s+you\s+please\s+help\s+me\s+to|could\s+you\s+please\s+help\s+me\s+to|please\s+help\s+me\s+to|can\s+you\s+please\s+help\s+me|could\s+you\s+please\s+help\s+me|please\s+help\s+me|can\s+you\s+please|could\s+you\s+please|would\s+you\s+please|would\s+you\s+mind|please\s+kindly|please|kindly|bisa\s+tolong\s+bantu\s+saya\s+untuk|tolong\s+bantu\s+saya\s+untuk|bisa\s+tolong\s+bantu\s+saya|tolong\s+bantu\s+saya|bisa\s+tolong|tolong|mohon|i\s+want\s+you\s+to|i\s+would\s+like\s+you\s+to|i\s+need\s+you\s+to|i'd\s+like\s+you\s+to|bantu\s+saya\s+untuk|can\s+you|could\s+you)[\s,]+/i;
const RE_PLEASANT_TAIL = /[\s,!.-]*(?:thank\s+you\s+(?:so\s+much|very\s+much|in\s+advance)|thank\s+you|thanks\s+a\s+lot|many\s+thanks|thanks|terima\s+kasih\s+banyak|terima\s+kasih|makasih)[\s,!.-]*$/i;

function compressInputText(text) {
  if (!text || typeof text !== "string") return text;
  let curr = text.trim();
  curr = curr.replace(RE_GREETING_LEAD, "");
  curr = curr.replace(RE_REQUEST_LEAD, "");
  curr = curr.replace(RE_PLEASANT_TAIL, "");
  curr = curr.replace(/^[,;:\-\s]+/, "").trim();
  return curr || text;
}

// --- RTK Compression Engine ---
function rtkCompressText(text, maxLines = 250, deduplicate = true) {
  if (!text || typeof text !== "string") return text;
  const lines = text.split("\n");
  if (lines.length <= 1) return text;

  let processed = lines;

  // Deduplicate consecutive identical lines
  if (deduplicate) {
    const deduped = [];
    let prev = null;
    let dupCount = 0;
    for (const line of lines) {
      if (line === prev) {
        dupCount++;
      } else {
        if (dupCount > 0) {
          deduped.push(`[... ${dupCount} identical lines omitted ...]`);
          dupCount = 0;
        }
        deduped.push(line);
        prev = line;
      }
    }
    if (dupCount > 0) {
      deduped.push(`[... ${dupCount} identical lines omitted ...]`);
    }
    processed = deduped;
  }

  // Smart truncation: head + tail
  if (processed.length > maxLines) {
    const headCount = Math.floor(maxLines * 0.4);
    const tailCount = Math.floor(maxLines * 0.6);
    const omitted = processed.length - headCount - tailCount;
    if (omitted > 5) {
      const head = processed.slice(0, headCount);
      const tail = processed.slice(processed.length - tailCount);
      processed = [
        ...head,
        `\n[... RTK: ${omitted} lines truncated to save tokens ...]\n`,
        ...tail,
      ];
    }
  }

  return processed.join("\n");
}

// --- Configuration Management ---
const DEFAULT_CONFIG = {
  rtkEnabled: process.env.RTK_ENABLED === "1" || process.env.RTK_ENABLED === "true",
  rtkMaxLines: parseInt(process.env.RTK_MAX_LINES || "250", 10),
  rtkDeduplicate: process.env.RTK_DEDUPLICATE !== "0" && process.env.RTK_DEDUPLICATE !== "false",
  cavemanEnabled: process.env.CAVEMAN_ENABLED === "1" || process.env.CAVEMAN_ENABLED === "true",
  cavemanLevel: process.env.CAVEMAN_LEVEL || "full", // "lite" | "full" | "ultra"
  cavemanLang: process.env.CAVEMAN_LANG || "auto",   // "auto" | "en" | "id"
  cavemanAutoClarity: process.env.CAVEMAN_AUTO_CLARITY !== "0",
  cavemanInputMode: process.env.CAVEMAN_INPUT_MODE === "1" || process.env.CAVEMAN_INPUT_MODE === "true",
  adhdEnabled: process.env.ADHD_ENABLED === "1" || process.env.ADHD_ENABLED === "true",
  adhdLevel: process.env.ADHD_LEVEL || "full",       // "lite" | "full"
  // SoulSpec & Personality Engine
  soulEnabled: process.env.SOUL_ENABLED === "1" || process.env.SOUL_ENABLED === "true",
  soulMode: process.env.SOUL_MODE || "auto",         // "auto" | "preset" | "custom"
  soulPreset: process.env.SOUL_PRESET || "atlas",
  soulFilePath: process.env.SOUL_FILE || "",
  soulCustomContent: "",
  // DLP & Security Guardrails
  dlpEnabled: process.env.DLP_ENABLED !== "0",
  maskSecrets: process.env.DLP_MASK_SECRETS !== "0",
  maskPaths: process.env.DLP_MASK_PATHS !== "0",
  sanitizeMarkdownImages: process.env.DLP_SANITIZE_IMAGES !== "0",
  blockDangerousCommands: process.env.DLP_BLOCK_COMMANDS !== "0",
};

let currentConfig = { ...DEFAULT_CONFIG };

function sanitizeConfig(input) {
  const safe: any = { ...DEFAULT_CONFIG };
  if (!input || typeof input !== "object" || Array.isArray(input)) return safe;
  for (const [key, fallback] of Object.entries(DEFAULT_CONFIG)) {
    const value = input[key];
    if (typeof fallback === "boolean" && typeof value === "boolean") safe[key] = value;
    else if (typeof fallback === "string" && typeof value === "string") {
      const limit = key === "soulCustomContent" ? 100000 : key === "soulFilePath" ? 1024 : 256;
      safe[key] = value.slice(0, limit);
    } else if (typeof fallback === "number" && Number.isFinite(Number(value))) {
      safe[key] = Math.min(5000, Math.max(1, Math.floor(Number(value))));
    }
  }
  if (!["lite", "full", "ultra"].includes(safe.cavemanLevel)) safe.cavemanLevel = DEFAULT_CONFIG.cavemanLevel;
  if (!["auto", "en", "id"].includes(safe.cavemanLang)) safe.cavemanLang = DEFAULT_CONFIG.cavemanLang;
  if (!["lite", "full"].includes(safe.adhdLevel)) safe.adhdLevel = DEFAULT_CONFIG.adhdLevel;
  if (!["auto", "preset", "custom"].includes(safe.soulMode)) safe.soulMode = DEFAULT_CONFIG.soulMode;
  return safe;
}

function loadConfig() {
  const fromDb = dbGetSetting("tokensaver_config", null);
  if (fromDb && typeof fromDb === "object" && !Array.isArray(fromDb)) {
    currentConfig = sanitizeConfig(fromDb);
    if (JSON.stringify(currentConfig) !== JSON.stringify(fromDb)) {
      dbSetSetting("tokensaver_config", currentConfig);
    }
  }
  return currentConfig;
}

function saveConfig(updates) {
  const patch = updates && typeof updates === "object" && !Array.isArray(updates) ? updates : {};
  const nextConfig = sanitizeConfig({ ...currentConfig, ...patch });
  // SQLite is authoritative. Do not report a successful update when the
  // transaction failed to persist it.
  dbSetSetting("tokensaver_config", nextConfig);
  currentConfig = nextConfig;
  return currentConfig;
}
// Initialize on module load
loadConfig();

function getCavemanPrompt(level = "full", lang = "auto") {
  const isId = lang === "id";
  switch (level.toLowerCase()) {
    case "lite":
      return isId ? CavemanLiteID : CavemanLite;
    case "ultra":
      return CavemanUltra;
    case "full":
    default:
      return isId ? CavemanFullID : CavemanFull;
  }
}

function getADHDPrompt(level = "full") {
  return level.toLowerCase() === "lite" ? ADHDLite : ADHDFull;
}

/**
 * Apply token saver transformations (DLP, RTK, Caveman, ADHD) to messages payload.
 */
function applyTokenSavers(messages, config = currentConfig, modelIds = []) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  let out = messages.map((m) => ({ ...m }));

  // 1. RTK: Compress tool results / command outputs
  if (config.rtkEnabled) {
    for (let i = 0; i < out.length; i++) {
      const msg = out[i];
      if (msg.role === "tool" || msg.role === "assistant" || (typeof msg.content === "string" && msg.content.length > 2000)) {
        if (typeof msg.content === "string") {
          msg.content = rtkCompressText(msg.content, config.rtkMaxLines, config.rtkDeduplicate);
        } else if (Array.isArray(msg.content)) {
          msg.content = msg.content.map((part) => {
            if (part && typeof part.text === "string") {
              return { ...part, text: rtkCompressText(part.text, config.rtkMaxLines, config.rtkDeduplicate) };
            }
            return part;
          });
        }
      }
    }
  }

  // 2. Caveman Input Mode: Strip conversational pleasantries from user messages
  if (config.cavemanInputMode) {
    for (let i = 0; i < out.length; i++) {
      const msg = out[i];
      if (msg.role === "user") {
        if (typeof msg.content === "string") {
          msg.content = compressInputText(msg.content);
        } else if (Array.isArray(msg.content)) {
          msg.content = msg.content.map((part) => {
            if (part && typeof part.text === "string") {
              return { ...part, text: compressInputText(part.text) };
            }
            return part;
          });
        }
      }
    }
  }

  // Collect prompts to inject
  const promptsToInject = [];

  // 3. SoulSpec System Prompt Injection (Primary Persona Anchor)
  if (config.soulEnabled) {
    const soulInfo = soulEngine.resolveSoulInfo(config);
    if (soulInfo && soulInfo.enabled && soulInfo.content) {
      promptsToInject.push(soulEngine.formatSoulPrompt(soulInfo.content));
    }
  }

  // 3b. Model-bound Persona prompt injection. SOUL remains global and keeps
  // its existing behavior; Persona is opt-in for exact IDs or keyword matches.
  if (Array.isArray(modelIds) && modelIds.length > 0) {
    const match = personaEngine.resolvePersonaForModels(modelIds);
    if (match.injected && match.prompt) {
      promptsToInject.push(personaEngine.formatPersonaPrompt(match.prompt));
      if (match.presetId) {
        try { personaEngine.recordPersonaUsage(match.presetId); } catch {}
      }
    }
  }

  // 4. Caveman Mode system prompt injection
  if (config.cavemanEnabled) {
    let bypass = false;
    if (config.cavemanAutoClarity) {
      // Check last user message for danger/clarity need
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].role === "user") {
          const text = typeof out[i].content === "string" ? out[i].content : JSON.stringify(out[i].content);
          if (shouldBypassCaveman(text)) {
            bypass = true;
            break;
          }
        }
      }
    }
    if (!bypass) {
      promptsToInject.push(getCavemanPrompt(config.cavemanLevel, config.cavemanLang));
    }
  }

  // 4. ADHD Mode system prompt injection
  if (config.adhdEnabled) {
    promptsToInject.push(getADHDPrompt(config.adhdLevel));
  }

  // Inject into system message
  if (promptsToInject.length > 0) {
    const combinedPrompt = promptsToInject.join("\n\n");
    const sysIdx = out.findIndex((m) => m && (m.role === "system" || m.role === "developer"));
    if (sysIdx === -1) {
      out.unshift({ role: "system", content: combinedPrompt });
    } else {
      const existing = out[sysIdx];
      if (typeof existing.content === "string") {
        out[sysIdx] = { ...existing, content: `${combinedPrompt}\n\n${existing.content}` };
      } else if (Array.isArray(existing.content)) {
        out[sysIdx] = {
          ...existing,
          content: [{ type: "text", text: `${combinedPrompt}\n\n` }, ...existing.content],
        };
      }
    }
  }

  // Final outbound DLP pass includes generated SOUL and model-bound Persona prompts.
  // These instructions are still outbound data and must not bypass redaction.
  if (config.dlpEnabled !== false) {
    out = securityGuard.sanitizeOutboundMessages(out, {
      maskSecrets: config.maskSecrets !== false,
      maskPaths: config.maskPaths !== false,
    });
  }

  return out;
}

function sanitizeInboundContent(text, options) {
  const builtIn = securityGuard.sanitizeInboundContent(text, options);
  return typeof builtIn === "string" ? sanitizeSecurityResponse(builtIn) : builtIn;
}

module.exports = {
  CavemanFull,
  CavemanLite,
  CavemanUltra,
  CavemanFullID,
  CavemanLiteID,
  ADHDFull,
  ADHDLite,
  shouldBypassCaveman,
  compressInputText,
  rtkCompressText,
  getCavemanPrompt,
  getADHDPrompt,
  applyTokenSavers,
  loadConfig,
  saveConfig,
  getConfig: () => currentConfig,
  DEFAULT_CONFIG,
  // SoulSpec & Personality exports
  soulEngine,
  resolveSoulInfo: soulEngine.resolveSoulInfo,
  formatSoulPrompt: soulEngine.formatSoulPrompt,
  // Security Guard & DLP exports
  redactSecrets: securityGuard.redactSecrets,
  anonymizeWorkspacePaths: securityGuard.anonymizeWorkspacePaths,
  sanitizeOutboundMessages: securityGuard.sanitizeOutboundMessages,
  sanitizeInboundContent,
};
