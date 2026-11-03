import { getDatabase } from "./database";

export interface SecurityKeywordRule {
  id: string;
  pattern: string;
  action: "mask" | "block";
  description: string;
  enabled: boolean;
}

export interface SecurityRuleMatch {
  id: string;
  pattern: string;
  action: "mask" | "block";
  description: string;
}

export interface SecurityTextInspection {
  text: string;
  blocked: SecurityRuleMatch | null;
  maskedRuleIds: string[];
}

export interface SecurityMessageInspection {
  messages: any[];
  blocked: SecurityRuleMatch | null;
  maskedRuleIds: string[];
}

interface TrieNode {
  next: Map<string, number>;
  fail: number;
  terminalBlock: number | null;
  terminalMask: number | null;
  block: number | null;
  mask: number | null;
}

interface CompiledRules {
  rules: SecurityKeywordRule[];
  nodes: TrieNode[];
}

export const DEFAULT_SECURITY_RULES: SecurityKeywordRule[] = [
  {
    id: "rule-1",
    pattern: "browser_cookies_db",
    action: "block",
    description: "Anti-Infostealer: Protect browser cookies and login databases",
    enabled: true,
  },
  {
    id: "rule-2",
    pattern: "dpapi_masterkey",
    action: "block",
    description: "Anti-Infostealer: Protect Windows DPAPI credentials and vault",
    enabled: true,
  },
  {
    id: "rule-3",
    pattern: "keychain_access",
    action: "block",
    description: "Anti-Infostealer: Protect macOS Keychain database",
    enabled: true,
  },
  {
    id: "rule-4",
    pattern: "openai_secret_token",
    action: "mask",
    description: "DLP: Redact provider API keys before forwarding",
    enabled: true,
  },
  {
    id: "rule-5",
    pattern: "aws_credentials",
    action: "mask",
    description: "DLP: Redact AWS access keys and session secrets",
    enabled: true,
  },
];

const MAX_RULES = 100;
const MAX_PATTERN_LENGTH = 128;
let compiledCache: CompiledRules | null = null;

function foldCasePreservingOffsets(value: string): string {
  // Preserve UTF-16 length so match offsets still address the original string.
  // Characters whose lowercase form expands to multiple code units are kept as-is.
  let folded = "";
  for (const character of value) {
    const lower = character.toLocaleLowerCase("en-US");
    folded += lower.length === character.length ? lower : character;
  }
  return folded;
}

export function normalizeSecurityRules(input: unknown): SecurityKeywordRule[] {
  if (!Array.isArray(input) || input.length > MAX_RULES) {
    throw new Error(`Security Rules must be an array with at most ${MAX_RULES} entries`);
  }

  const ids = new Set<string>();
  const patterns = new Set<string>();
  const normalized: SecurityKeywordRule[] = [];

  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("Every Security Rule must be an object");
    }
    const value = candidate as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const pattern = typeof value.pattern === "string" ? value.pattern.trim() : "";
    const description = typeof value.description === "string" ? value.description.trim() : "";

    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || ids.has(id)) {
      throw new Error("Security Rule IDs must be unique and contain only letters, numbers, _ or -");
    }
    const printable = pattern.length > 0 && [...pattern].every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && !(code >= 127 && code <= 159);
    });
    if (!printable || pattern.length > MAX_PATTERN_LENGTH) {
      throw new Error(`Security Rule patterns must be 1-${MAX_PATTERN_LENGTH} printable characters`);
    }
    if (value.action !== "mask" && value.action !== "block") {
      throw new Error("Security Rule action must be mask or block");
    }
    if (description.length > 256 || typeof value.enabled !== "boolean") {
      throw new Error("Security Rule description or enabled flag is invalid");
    }

    const patternKey = foldCasePreservingOffsets(pattern);
    if (patterns.has(patternKey)) {
      throw new Error("Security Rule patterns must be unique (case-insensitive)");
    }
    ids.add(id);
    patterns.add(patternKey);
    normalized.push({
      id,
      pattern,
      action: value.action,
      description,
      enabled: value.enabled,
    });
  }

  return normalized;
}

function betterMaskRule(rules: SecurityKeywordRule[], left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  const a = rules[left];
  const b = rules[right];
  if (a.pattern.length !== b.pattern.length) return a.pattern.length > b.pattern.length ? left : right;
  return a.id.localeCompare(b.id) <= 0 ? left : right;
}

function compileRules(rules: SecurityKeywordRule[]): CompiledRules {
  const active = rules.filter((rule) => rule.enabled);
  const nodes: TrieNode[] = [{
    next: new Map(),
    fail: 0,
    terminalBlock: null,
    terminalMask: null,
    block: null,
    mask: null,
  }];

  for (let index = 0; index < active.length; index += 1) {
    let state = 0;
    const pattern = foldCasePreservingOffsets(active[index].pattern);
    for (let characterIndex = 0; characterIndex < pattern.length; characterIndex += 1) {
      const character = pattern[characterIndex];
      let child = nodes[state].next.get(character);
      if (child === undefined) {
        child = nodes.length;
        nodes[state].next.set(character, child);
        nodes.push({
          next: new Map(),
          fail: 0,
          terminalBlock: null,
          terminalMask: null,
          block: null,
          mask: null,
        });
      }
      state = child;
    }
    if (active[index].action === "block") {
      if (nodes[state].terminalBlock === null) nodes[state].terminalBlock = index;
    } else {
      nodes[state].terminalMask = betterMaskRule(active, nodes[state].terminalMask, index);
    }
  }

  const queue: number[] = [];
  for (const child of nodes[0].next.values()) queue.push(child);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const state = queue[cursor];
    const inherited = nodes[nodes[state].fail];
    const own = nodes[state];
    own.block = own.terminalBlock ?? inherited.block;
    own.mask = betterMaskRule(active, own.terminalMask, inherited.mask);

    for (const [character, child] of own.next) {
      let failure = own.fail;
      while (failure !== 0 && !nodes[failure].next.has(character)) {
        failure = nodes[failure].fail;
      }
      const target = nodes[failure].next.get(character);
      nodes[child].fail = target !== undefined && target !== child ? target : 0;
      queue.push(child);
    }
  }

  nodes[0].block = nodes[0].terminalBlock;
  nodes[0].mask = nodes[0].terminalMask;
  return { rules: active, nodes };
}

function readCompiledRules(): CompiledRules {
  if (compiledCache) return compiledCache;
  const rows = getDatabase().prepare(`
    SELECT id, pattern, action, description, enabled
    FROM security_rules
    ORDER BY sort_order ASC, id ASC
  `).all() as Array<{
    id: string;
    pattern: string;
    action: "mask" | "block";
    description: string;
    enabled: number;
  }>;
  const rules = rows.map((row) => ({
    id: String(row.id),
    pattern: String(row.pattern),
    action: row.action,
    description: String(row.description),
    enabled: Number(row.enabled) === 1,
  }));
  compiledCache = compileRules(rules);
  return compiledCache;
}

export function listSecurityRules(): SecurityKeywordRule[] {
  // Build the request-time matcher from the same canonical SQLite rows.
  readCompiledRules();
  return getDatabase().prepare(`
    SELECT id, pattern, action, description, enabled
    FROM security_rules
    ORDER BY sort_order ASC, id ASC
  `).all().map((row: any) => ({
    id: String(row.id),
    pattern: String(row.pattern),
    action: row.action as "mask" | "block",
    description: String(row.description),
    enabled: Number(row.enabled) === 1,
  }));
}

export function replaceSecurityRules(input: unknown): SecurityKeywordRule[] {
  const rules = normalizeSecurityRules(input);
  const db = getDatabase();
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.exec("DELETE FROM security_rules");
    const insert = db.prepare(`
      INSERT INTO security_rules (id, pattern, action, description, enabled, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];
      insert.run(rule.id, rule.pattern, rule.action, rule.description, rule.enabled ? 1 : 0, index, now, now);
    }
  });
  transaction();
  compiledCache = compileRules(rules);
  return rules;
}

function matchText(text: string, compiled: CompiledRules): SecurityTextInspection {
  if (!text || compiled.rules.length === 0) {
    return { text, blocked: null, maskedRuleIds: [] };
  }

  const lower = foldCasePreservingOffsets(text);
  const matches = new Map<number, number>();
  let state = 0;

  for (let index = 0; index < lower.length; index += 1) {
    const character = lower[index];
    while (state !== 0 && !compiled.nodes[state].next.has(character)) {
      state = compiled.nodes[state].fail;
    }
    state = compiled.nodes[state].next.get(character) ?? 0;
    const node = compiled.nodes[state];

    if (node.block !== null) {
      const rule = compiled.rules[node.block];
      return {
        text,
        blocked: { id: rule.id, pattern: rule.pattern, action: "block", description: rule.description },
        maskedRuleIds: [],
      };
    }

    if (node.mask !== null) {
      const ruleIndex = node.mask;
      const rule = compiled.rules[ruleIndex];
      const start = index - rule.pattern.length + 1;
      if (start >= 0) {
        const previous = matches.get(start);
        matches.set(start, betterMaskRule(compiled.rules, previous ?? null, ruleIndex) ?? ruleIndex);
      }
    }
  }

  if (matches.size === 0) return { text, blocked: null, maskedRuleIds: [] };

  const ordered = [...matches.entries()].sort((a, b) => a[0] - b[0]);
  const parts: string[] = [];
  const maskedRuleIds: string[] = [];
  let cursor = 0;

  for (const [start, ruleIndex] of ordered) {
    const rule = compiled.rules[ruleIndex];
    if (start < cursor) continue;
    parts.push(text.slice(cursor, start));
    parts.push(`[REDACTED_SECURITY_RULE:${rule.id}]`);
    cursor = start + rule.pattern.length;
    maskedRuleIds.push(rule.id);
  }
  parts.push(text.slice(cursor));

  return {
    text: parts.join(""),
    blocked: null,
    maskedRuleIds: [...new Set(maskedRuleIds)],
  };
}

export function inspectSecurityText(text: string): SecurityTextInspection {
  return matchText(text, readCompiledRules());
}

/** Apply exact, case-insensitive literal rules. Regex execution is deliberately unsupported. */
const MAX_SECURITY_INSPECTION_DEPTH = 32;

interface NestedInspection {
  value: any;
  blocked: SecurityRuleMatch | null;
}

/**
 * Traverse the entire JSON-compatible message tree so Security Rules also
 * cover tool-call arguments, reasoning fields, and nested text content parts.
 * Excessive nesting fails closed rather than leaving an uninspected branch.
 */
function inspectNestedValue(
  value: any,
  compiled: CompiledRules,
  maskedRuleIds: Set<string>,
  depth: number,
): NestedInspection {
  if (typeof value === "string") {
    const result = matchText(value, compiled);
    result.maskedRuleIds.forEach((id) => maskedRuleIds.add(id));
    return { value: result.text, blocked: result.blocked };
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_SECURITY_INSPECTION_DEPTH) {
      return {
        value,
        blocked: {
          id: "inspection-depth-limit",
          pattern: "",
          action: "block",
          description: "Message payload exceeded the Security Rules inspection depth limit.",
        },
      };
    }
    const output: any[] = [];
    for (const entry of value) {
      const inspected = inspectNestedValue(entry, compiled, maskedRuleIds, depth + 1);
      if (inspected.blocked) return { value, blocked: inspected.blocked };
      output.push(inspected.value);
    }
    return { value: output, blocked: null };
  }

  if (value && typeof value === "object") {
    if (depth >= MAX_SECURITY_INSPECTION_DEPTH) {
      return {
        value,
        blocked: {
          id: "inspection-depth-limit",
          pattern: "",
          action: "block",
          description: "Message payload exceeded the Security Rules inspection depth limit.",
        },
      };
    }
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const inspected = inspectNestedValue(entry, compiled, maskedRuleIds, depth + 1);
      if (inspected.blocked) return { value, blocked: inspected.blocked };
      Object.defineProperty(output, key, {
        value: inspected.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return { value: output, blocked: null };
  }

  return { value, blocked: null };
}

/** Apply literal rules to every textual value in JSON-compatible message data. */
export function inspectSecurityMessages(messages: unknown): SecurityMessageInspection {
  if (!Array.isArray(messages)) {
    return { messages: [], blocked: null, maskedRuleIds: [] };
  }

  const compiled = readCompiledRules();
  if (compiled.rules.length === 0) {
    return { messages: messages as any[], blocked: null, maskedRuleIds: [] };
  }

  const output: any[] = [];
  const masked = new Set<string>();

  for (const message of messages) {
    const inspected = inspectNestedValue(message, compiled, masked, 0);
    if (inspected.blocked) {
      return { messages: messages as any[], blocked: inspected.blocked, maskedRuleIds: [] };
    }
    output.push(inspected.value);
  }

  return { messages: output, blocked: null, maskedRuleIds: [...masked] };
}

/** Sanitize a provider response. A block rule replaces the complete text body. */
export function sanitizeSecurityResponse(text: string): string {
  const result = inspectSecurityText(text);
  if (result.blocked) return `[BLOCKED_BY_ALPHAWAY: Security rule ${result.blocked.id}]`;
  return result.text;
}
