import { URL } from "node:url";

const SENSITIVE_QUERY_NAME =
  /(?:^|[_-])(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|client[-_]?secret|signature|auth|credential|key)(?:$|[_-])/i;

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function embeddedProviderUrlSecrets(input: string): string[] {
  try {
    const url = new URL(String(input || ""));
    const values = [decode(url.username), decode(url.password)];
    for (const [name, value] of url.searchParams.entries()) {
      if (SENSITIVE_QUERY_NAME.test(name)) values.push(value);
    }
    return [...new Set(values.filter(Boolean))];
  } catch {
    return [];
  }
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
    return raw;
  }
}
