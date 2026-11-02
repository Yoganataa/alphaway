import { URL } from "node:url";

const SENSITIVE_QUERY_NAME =
  /(?:^|[_-])(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|client[-_]?secret|signature|auth|credential|key)(?:$|[_-])/i;

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function embeddedProviderUrlSecrets(input: string): string[] {
  try {
    const url = new URL(String(input || ""));
    const values = [url.username, url.password, decode(url.username), decode(url.password)];
    for (const [name, value] of url.searchParams.entries()) {
      if (SENSITIVE_QUERY_NAME.test(name)) values.push(value, encodeURIComponent(value));
    }
    return [...new Set(values.filter(Boolean))];
  } catch {
    return [];
  }
}

/** Redacts credential echoes in upstream error bodies and diagnostics. */
export function redactCredentialEchoes(input: string, secrets: string[], maxLength = 1200): string {
  let sanitized = String(input || "").slice(0, maxLength);
  const candidates = new Set<string>();
  for (const secretInput of secrets) {
    const secret = String(secretInput || "");
    if (!secret) continue;
    candidates.add(secret);
    candidates.add(encodeURIComponent(secret));
    const token = secret.replace(/^Bearer\\s+/i, "");
    candidates.add(token);
    if (token) candidates.add("Bearer " + token);
    try { candidates.add(decodeURIComponent(secret)); } catch {}
    try { candidates.add("Bearer " + decodeURIComponent(token)); } catch {}
  }
  for (const secret of [...candidates].filter(Boolean).sort((a, b) => b.length - a.length)) {
    sanitized = sanitized.replaceAll(secret, "[REDACTED]");
  }
  // Redact URL authority credentials even when the exact configured secret
  // was not included in the caller-provided secret list.
  return sanitized.replace(/(https?:\\/\\/)[^/@\\s]+@/gi, "$1[REDACTED]@").slice(0, maxLength);
}
export function hasEmbeddedProviderUrlSecrets(input: string): boolean {
  return embeddedProviderUrlSecrets(input).length > 0;
}

/** Safe URL for admin/dashboard responses. Credential-bearing query parameters are omitted. */
export function redactProviderBaseUrl(input: string): string {
  const raw = String(input || "");
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    for (const name of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_NAME.test(name)) url.searchParams.delete(name);
    }
    const safe = url.toString();
    return raw.endsWith("/") && !safe.endsWith("/") ? safe + "/" : safe;
  } catch {
    let safe = raw.replace(/(https?:\\/\\/)[^/@\\s]+@/gi, "$1");
    safe = safe.replace(/([?&])([^=&#]+)=([^&#]*)/g, (match, separator, name) =>
      SENSITIVE_QUERY_NAME.test(name) ? separator + name + "=[REDACTED]" : match
    );
    return safe.replace(/\\?&/, "?").replace(/[?&]$/, "");
  }
}
