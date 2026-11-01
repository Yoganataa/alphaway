import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDatabase, resolveDbDir } from "./database";

const BOOTSTRAP_FILE = "admin-bootstrap.token";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PASSWORD_BYTES = 64;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const failedLogins = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_FAILED_LOGINS = 4096;

export interface AdminIdentity {
  id: string;
  username: string;
}

function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, PASSWORD_BYTES, SCRYPT_OPTIONS, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getAdminBootstrapTokenPath(): string {
  return path.join(resolveDbDir(), BOOTSTRAP_FILE);
}

function hasAdmin(): boolean {
  return Number(
    getDatabase().prepare("SELECT COUNT(*) AS count FROM admin_users").get()?.count || 0
  ) > 0;
}

function removeBootstrapToken(): void {
  try { fs.unlinkSync(getAdminBootstrapTokenPath()); } catch {}
}

function readBootstrapToken(): string | null {
  const filePath = getAdminBootstrapTokenPath();
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("Administrator bootstrap token path must be a regular file");
    }
    if (process.platform !== "win32") {
      try { fs.chmodSync(filePath, 0o600); } catch {}
    }
    return fs.readFileSync(filePath, "utf8").trim();
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function ensureBootstrapToken(): string {
  const directory = resolveDbDir();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try { fs.chmodSync(directory, 0o700); } catch {}
  }

  const current = readBootstrapToken();
  if (current) return current;

  const token = randomBytes(32).toString("base64url");
  const filePath = getAdminBootstrapTokenPath();
  try {
    const fd = fs.openSync(filePath, "wx", 0o600);
    try {
      fs.writeFileSync(fd, token, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (error: any) {
    if (error?.code !== "EEXIST") throw error;
    const raced = readBootstrapToken();
    if (raced) return raced;
    throw error;
  }
  if (process.platform !== "win32") {
    try { fs.chmodSync(filePath, 0o600); } catch {}
  }
  return token;
}

/** Creates the one-time bootstrap credential but never returns it from an HTTP API. */
export function getAdminBootstrapTokenForCli(): string | null {
  if (hasAdmin()) {
    removeBootstrapToken();
    return null;
  }
  return ensureBootstrapToken();
}

export function getAdminAuthStatus(): { configured: boolean; setupRequired: boolean } {
  const configured = hasAdmin();
  if (configured) removeBootstrapToken();
  else ensureBootstrapToken();
  return { configured, setupRequired: !configured };
}

export async function bootstrapAdmin(input: {
  bootstrapToken: string;
  username: string;
  password: string;
}): Promise<AdminIdentity | null> {
  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(username)) {
    throw new Error("Username must be 1–32 characters using letters, numbers, dot, underscore, or hyphen");
  }
  if (password.length < 12 || password.length > 1024) {
    throw new Error("Administrator password must be 12–1024 characters");
  }

  if (hasAdmin()) {
    removeBootstrapToken();
    return null;
  }

  const expectedToken = readBootstrapToken() || ensureBootstrapToken();
  if (!safeEqual(String(input.bootstrapToken || ""), expectedToken)) return null;

  const salt = randomBytes(16).toString("hex");
  const passwordHash = await scrypt(password, salt);
  const db = getDatabase();
  const id = randomUUID();
  const create = db.transaction(() => {
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM admin_users").get()?.count || 0);
    if (count > 0) return false;
    db.prepare(
      "INSERT INTO admin_users (id, username, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, username, salt, passwordHash.toString("hex"), Date.now());
    return true;
  });

  if (!create()) {
    removeBootstrapToken();
    return null;
  }
  removeBootstrapToken();
  return { id, username };
}

function loginThrottleKey(username: string): string {
  return String(username || "").trim().toLowerCase();
}

function pruneFailedLogins(now: number): void {
  for (const [key, attempt] of failedLogins) {
    if (now - attempt.firstAt > LOGIN_WINDOW_MS && attempt.lockedUntil <= now) {
      failedLogins.delete(key);
    }
  }
}

function rememberFailedLogin(
  key: string,
  attempt: { count: number; firstAt: number; lockedUntil: number }
): void {
  // Refresh insertion order and bound memory when clients submit many unique usernames.
  failedLogins.delete(key);
  if (failedLogins.size >= MAX_TRACKED_FAILED_LOGINS) {
    const oldest = failedLogins.keys().next().value;
    if (oldest) failedLogins.delete(oldest);
  }
  failedLogins.set(key, attempt);
}

export async function loginAdmin(
  usernameInput: string,
  password: string
): Promise<{ identity: AdminIdentity; sessionToken: string } | { error: "invalid" | "rate_limited" }> {
  const username = String(usernameInput || "").trim();
  const inputPassword = String(password || "");
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(username) || inputPassword.length < 1 || inputPassword.length > 1024) {
    return { error: "invalid" };
  }

  const key = loginThrottleKey(username);
  const now = Date.now();
  pruneFailedLogins(now);
  const attempt = failedLogins.get(key);
  if (attempt && attempt.lockedUntil > now) return { error: "rate_limited" };

  const db = getDatabase();
  const row = db.prepare(
    "SELECT id, username, password_salt, password_hash FROM admin_users WHERE username = ? COLLATE NOCASE"
  ).get(username) as any;

  // Run the same KDF for unknown usernames to avoid a cheap account-enumeration oracle.
  const salt = row?.password_salt || "00000000000000000000000000000000";
  const derived = await scrypt(inputPassword, salt);
  const expected = Buffer.from(row?.password_hash || "0".repeat(PASSWORD_BYTES * 2), "hex");
  const valid = Boolean(row) && derived.length === expected.length && timingSafeEqual(derived, expected);
  if (!valid) {
    const previous = failedLogins.get(key);
    const firstAt = previous?.firstAt && now - previous.firstAt <= 15 * 60 * 1000 ? previous.firstAt : now;
    const count = (previous?.count || 0) + 1;
    rememberFailedLogin(key, {
      count,
      firstAt,
      lockedUntil: count >= 5 ? firstAt + LOGIN_WINDOW_MS : 0,
    });
    return { error: count >= 5 ? "rate_limited" : "invalid" };
  }

  failedLogins.delete(key);
  const sessionToken = randomBytes(32).toString("base64url");
  const createdAt = Date.now();
  const expiresAt = createdAt + SESSION_TTL_MS;
  const persist = db.transaction(() => {
    db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(createdAt);
    db.prepare(
      "INSERT INTO admin_sessions (id, user_id, token_hash, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(randomUUID(), row.id, sha256(sessionToken), createdAt, expiresAt, createdAt);
  });
  persist();

  return {
    identity: { id: String(row.id), username: String(row.username) },
    sessionToken,
  };
}

export function resolveAdminSession(sessionToken: string | null | undefined): AdminIdentity | null {
  const token = String(sessionToken || "");
  if (token.length < 32 || token.length > 256) return null;

  const now = Date.now();
  const db = getDatabase();
  const row = db.prepare(`
    SELECT users.id, users.username, sessions.last_used_at
    FROM admin_sessions AS sessions
    JOIN admin_users AS users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(sha256(token), now) as any;
  if (!row) return null;

  if (now - Number(row.last_used_at || 0) > 5 * 60 * 1000) {
    db.prepare("UPDATE admin_sessions SET last_used_at = ? WHERE token_hash = ?").run(now, sha256(token));
  }
  return { id: String(row.id), username: String(row.username) };
}

export function revokeAdminSession(sessionToken: string | null | undefined): void {
  const token = String(sessionToken || "");
  if (!token || token.length > 256) return;
  getDatabase().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(sha256(token));
}

export function readAdminSessionCookie(c: any): string | null {
  const header = String(c.req.header("cookie") || "");
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === "alphaway_admin_session") {
      try { return decodeURIComponent(value.join("=")); } catch { return value.join("="); }
    }
  }
  return null;
}

export const ADMIN_SESSION_COOKIE = "alphaway_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
