/**
 * Admin Request Guard (DNS Rebinding & CSRF Protection)
 */

import * as os from "os";

export function hostnameOf(hostHeader: string | null | undefined): string {
  const raw = String(hostHeader || "").trim();
  if (!raw) return "";
  const v6 = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (v6) return v6[1];
  return raw.replace(/:\d+$/, "");
}

export function allowedAdminHosts(): Set<string> {
  const hosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const tunnelCandidates = [
    process.env.TUNNEL_URL,
    process.env.PUBLIC_URL,
    process.env.CF_TUNNEL_ENDPOINT,
    process.env.TUNNEL_HOST,
    process.env.CF_TUNNEL_HOST,
  ];
  for (const candidate of tunnelCandidates) {
    if (!candidate) continue;
    try {
      const u = candidate.includes("://") ? new URL(candidate) : new URL("https://" + candidate);
      if (u.hostname) hosts.add(u.hostname.toLowerCase());
    } catch {}
  }
  for (const extra of String(process.env.PANEL_ALLOWED_HOSTS || "").split(",")) {
    const trimmed = extra.trim().toLowerCase();
    if (trimmed) hosts.add(trimmed);
  }
  const bound = String(process.env.HOST || "").toLowerCase();
  const wildcard = !bound || bound === "0.0.0.0" || bound === "::" || bound === "[::]";
  if (!wildcard) hosts.add(bound);
  if (wildcard) {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const addr of list || []) {
        if (addr && addr.address) hosts.add(String(addr.address).toLowerCase());
      }
    }
  }
  return hosts;
}

export function adminRequestError(c: any): string | null {
  let rawHost = c.req.header("host");
  if (!rawHost && c.req.url) {
    try {
      rawHost = new URL(c.req.url).host;
    } catch {}
  }
  const host = hostnameOf(rawHost).toLowerCase();
  if (!host) return "Host header is required.";
  if (!allowedAdminHosts().has(host)) {
    return `Host ${host} is not allowed. The panel only accepts local hosts; add it to PANEL_ALLOWED_HOSTS if this is intended.`;
  }

  const site = String(c.req.header("sec-fetch-site") || "").toLowerCase();
  if (site === "cross-site") {
    return "Cross-site request rejected. Open the panel directly from this host.";
  }

  const origin = String(c.req.header("origin") || "").trim();
  if (origin) {
    let incomingOrigin: string;
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
        return "Origin must use HTTP or HTTPS.";
      }
      incomingOrigin = parsedOrigin.origin.toLowerCase();
    } catch {
      return "Origin is invalid.";
    }

    // Origin is a tuple (scheme, host, port), not a hostname. Comparing only
    // hostname permits same-site pages on another port to submit cookie-authenticated
    // requests because SameSite cookies are not port-scoped.
    const requestUrl = new URL(c.req.url);
    const forwardedProto = process.env.TRUST_PROXY === "1"
      ? String(c.req.header("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase()
      : "";
    const protocol = forwardedProto || requestUrl.protocol.slice(0, -1).toLowerCase();
    if (protocol !== "http" && protocol !== "https") {
      return "Request protocol is invalid for administrator access.";
    }
    let requestOrigin: string;
    try {
      requestOrigin = new URL(`${protocol}://${rawHost}`).origin.toLowerCase();
    } catch {
      return "Request origin is invalid.";
    }

    const configuredOrigins = new Set(
      String(process.env.CORS_ORIGIN || "")
        .split(",")
        .map((value) => {
          try {
            const parsed = new URL(value.trim());
            return parsed.protocol === "http:" || parsed.protocol === "https:"
              ? parsed.origin.toLowerCase()
              : "";
          } catch {
            return "";
          }
        })
        .filter(Boolean)
    );
    if (incomingOrigin !== requestOrigin && !configuredOrigins.has(incomingOrigin)) {
      return "Origin does not match the administrator request origin.";
    }
  }
  return null;
}

export const MAX_ADMIN_AUTH_BODY_BYTES = 16 * 1024;
export const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** Parse a JSON request body without allowing an unbounded stream allocation. */
export async function readJsonRequestBody(req: any, maxBytes: number = MAX_BODY_BYTES): Promise<any | null> {
  const raw = req?.raw || req;
  const contentLength = typeof req?.header === "function"
    ? req.header("content-length")
    : raw?.headers?.get?.("content-length");
  if (contentLength != null && contentLength !== "") {
    if (!/^\d+$/.test(String(contentLength))) {
      const error: any = new Error("Request Content-Length is invalid");
      error.statusCode = 400;
      throw error;
    }
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared)) {
      const error: any = new Error("Request Content-Length is invalid");
      error.statusCode = 400;
      throw error;
    }
    if (declared > maxBytes) {
      const error: any = new Error(`Request body exceeds limit of ${maxBytes} bytes`);
      error.statusCode = 413;
      error.code = "payload_too_large";
      throw error;
    }
  }

  const stream = raw?.body;
  if (!stream || typeof stream.getReader !== "function") return null;

  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = Buffer.from(value);
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch {}
        const error: any = new Error(`Request body exceeds limit of ${maxBytes} bytes`);
        error.statusCode = 413;
        error.code = "payload_too_large";
        throw error;
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  const text = Buffer.concat(chunks, totalBytes).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function readRequestBody(req: any, maxBytes: number = MAX_BODY_BYTES): Promise<string> {
  const declared = parseInt(req?.headers?.["content-length"] || "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    const err: any = new Error(`Request body exceeds limit of ${maxBytes} bytes`);
    err.statusCode = 413;
    err.code = "payload_too_large";
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let done = false;
    const cleanup = () => {
      if (typeof req.off === "function") {
        req.off("error", onError);
        req.off("data", onData);
        req.off("end", onEnd);
      } else if (typeof req.removeListener === "function") {
        req.removeListener("error", onError);
        req.removeListener("data", onData);
        req.removeListener("end", onEnd);
      }
    };

    const onError = (err: any) => {
      if (done) return;
      done = true;
      cleanup();
      reject(err);
    };

    const onData = (chunk: any) => {
      if (done) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        done = true;
        chunks.length = 0;
        cleanup();
        if (typeof req.pause === "function") req.pause();
        const err: any = new Error(`Request body exceeds limit of ${maxBytes} bytes`);
        err.statusCode = 413;
        err.code = "payload_too_large";
        reject(err);
        return;
      }
      chunks.push(buf);
    };

    const onEnd = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };

    req.on("error", onError);
    req.on("data", onData);
    req.on("end", onEnd);
  });
}
