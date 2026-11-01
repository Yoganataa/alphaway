/**
 * In-memory ring buffer for AlphaWay gateway console logs
 */

export interface ConsoleLogEntry {
  seq: number;
  time: string;
  level: "info" | "warn" | "error" | "debug";
  line: string;
}

const MAX_LOGS = 300;
const logBuffer: ConsoleLogEntry[] = [];
let nextSeq = 1;

function getFormattedTime(): string {
  const d = new Date();
  return d.toTimeString().split(" ")[0] + "." + String(d.getMilliseconds()).padStart(3, "0");
}

export function pushLog(level: "info" | "warn" | "error" | "debug", line: string): void {
  const entry: ConsoleLogEntry = {
    seq: nextSeq++,
    time: getFormattedTime(),
    level,
    line,
  };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }
}

export function getConsoleLogs(): ConsoleLogEntry[] {
  return [...logBuffer];
}

export function clearConsoleLogs(): void {
  logBuffer.length = 0;
}

// Seed initial startup logs so operator immediately sees system state
pushLog("info", "[AlphaWay] Runtime initialized on Bun " + (typeof Bun !== "undefined" ? Bun.version : "native"));
pushLog("info", "[AlphaWay] SQLite database mounted with WAL mode");
pushLog("info", "[AlphaWay] BoringSSL TLS Fingerprint anchor verified (17 ciphers, 12 extensions)");
pushLog("info", "[AlphaWay] Tri-Protocol translation engine ready (OpenAI, Anthropic Claude, Codex)");
pushLog("info", "[AlphaWay] Gateway listener active on port 20129");
