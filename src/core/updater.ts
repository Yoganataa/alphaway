/**
 * AlphaWay Self-Updater and Module Repair
 * Matches OpenCode CLI update mechanism with zero external dependencies.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as egress from "./egress";

const pkgPath = path.join(__dirname, "..", "..", "package.json");
let currentVersion = "0.0.1";
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.version) currentVersion = pkg.version;
} catch {}

export const VERSION = currentVersion;

export const UPDATE_BASE_URL =
  process.env.ALPHAWAY_UPDATE_BASE ||
  process.env.OPENCODE_BRIDGE_UPDATE_BASE ||
  "https://raw.githubusercontent.com/yoganataa/alphaway/main";

export const AUTO_UPDATE =
  process.env.AUTO_UPDATE !== "0" && process.env.AUTO_UPDATE !== "false";

export const UPDATE_FILES = [
  "package.json",
  "identity.js",
  "token-budget.js",
  "verify.js",
  "gate-drill.js",
  "transport-fingerprint.js",
  "transport-baseline.json",
  "tunnel-doctor.sh",
  "proxy.js",
  "panel.js",
  "panel/styles.js",
  "panel/sidebar.js",
  "panel/topbar.js",
  "panel/modal.js",
  "panel/scripts.js",
  "panel/views/overview.js",
  "panel/views/providers.js",
  "panel/views/models.js",
  "panel/views/tokensaver.js",
  "panel/views/egress.js",
  "egress-proxy.js",
  "tunnel.js",
  "daemon.js",
  "tokensaver.js",
  "codebuddy.js",
  "server.js",
  "THIRD_PARTY_NOTICES.md",
];

let updateInFlight: Promise<any> | null = null;
let lastUpdateCheck = 0;
export const UPDATE_CHECK_TTL_MS = 6 * 60 * 60 * 1000;

export function __setLastUpdateCheck(time: number): void {
  lastUpdateCheck = time;
}

export function __getLastUpdateCheck(): number {
  return lastUpdateCheck;
}

/**
 * Compare two `x.y.z` versions. Returns true when `remote` is newer.
 */
export function isNewerVersion(current: string, remote: string): boolean {
  const a = String(current).split(".").map(Number);
  const b = String(remote).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const av = Number.isFinite(a[i]) ? a[i] : 0;
    const bv = Number.isFinite(b[i]) ? b[i] : 0;
    if (bv !== av) return bv > av;
  }
  return false;
}

/**
 * Local modules required by relative path.
 */
export function localRequires(source: string): string[] {
  const names = new Set<string>();
  const text = String(source || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  for (const re of [
    /\brequire\(\s*["']\.\/([A-Za-z0-9._-]+)["']\s*\)/g,
    /\bloadLocalModule\(\s*["']([A-Za-z0-9._-]+)["']/g,
  ]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      if (match[1].endsWith(".json")) continue;
      const name = match[1].endsWith(".js") ? match[1] : `${match[1]}.js`;
      names.add(name);
    }
  }
  return [...names];
}

/**
 * Fetch files that `server.js` requires but that are not on disk.
 */
export async function repairMissingModules(dir = path.join(__dirname, "..", "..")): Promise<{ repaired: string[]; failed: string[] }> {
  const serverFile = path.join(dir, "server.js");
  if (!fs.existsSync(serverFile)) {
    return { repaired: [], failed: [] };
  }
  const required = new Set(localRequires(fs.readFileSync(serverFile, "utf8")));
  for (const name of ["proxy.js", "panel.js"]) required.add(name);
  const missing = [...required].filter((f) => !fs.existsSync(path.join(dir, f)));
  const repaired: string[] = [];
  const failed: string[] = [];
  for (const file of missing) {
    try {
      const res = await fetch(`${UPDATE_BASE_URL}/${file}?cb=${Date.now()}`, {
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 20) throw new Error("empty response");
      new Function(text.replace(/^#!.*\n/, ""));
      const tmp = path.join(dir, `.${file}.repair.${process.pid}`);
      fs.writeFileSync(tmp, text, "utf8");
      fs.renameSync(tmp, path.join(dir, file));
      repaired.push(file);
    } catch (err: any) {
      failed.push(`${file}: ${err?.message || String(err)}`);
    }
  }
  if (repaired.length) {
    console.log(`[AlphaWay] Repaired missing module(s): ${repaired.join(", ")}`);
  }
  if (failed.length) {
    console.warn(
      `[AlphaWay] Could not repair ${failed.join(", ")}; ` +
        "running with direct egress. Re-run install.sh to fix this install."
    );
  }
  return { repaired, failed };
}

/**
 * Check this repo's published package.json, and when it is newer, download every shipped file
 * into a temp file, syntax-check, rename them into place and exit so the service manager restarts.
 */
export async function checkAndApplyUpdate(serverInstance?: any): Promise<{ updated: boolean; reason?: string; version?: string; error?: string }> {
  if (!AUTO_UPDATE) return { updated: false, reason: "disabled" };
  if (updateInFlight) return updateInFlight;
  if (Date.now() - lastUpdateCheck < UPDATE_CHECK_TTL_MS) {
    return { updated: false, reason: "fresh" };
  }

  const rootDir = path.join(__dirname, "..", "..");
  if (
    process.env.AUTO_UPDATE !== "1" &&
    process.env.AUTO_UPDATE !== "force" &&
    !process.env.OPENCODE_BRIDGE_UPDATE_BASE &&
    fs.existsSync(path.join(rootDir, ".git"))
  ) {
    return { updated: false, reason: "git-checkout" };
  }

  updateInFlight = (async () => {
    lastUpdateCheck = Date.now();
    const tmpFiles: Array<{ tmpPath: string; targetPath: string }> = [];
    const cb = Date.now();
    try {
      const fetchFn = (globalThis as any).fetch || fetch;
      const pkgRes = await fetchFn(`${UPDATE_BASE_URL}/package.json?cb=${cb}`, {
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(8000),
      });
      if (!pkgRes.ok) throw new Error(`HTTP ${pkgRes.status} fetching package.json`);
      const remotePkg = await pkgRes.json();
      const remoteVersion = String(remotePkg?.version || "").trim();
      if (!/^\d+\.\d+\.\d+$/.test(remoteVersion)) throw new Error("invalid remote version");
      if (!isNewerVersion(VERSION, remoteVersion)) {
        return { updated: false, reason: "up-to-date" };
      }

      for (const file of UPDATE_FILES) {
        const res = await fetchFn(`${UPDATE_BASE_URL}/${file}?cb=${cb}`, {
          headers: { "Cache-Control": "no-cache" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${file}`);
        const text = await res.text();
        if (!text || text.length < 20) throw new Error(`empty response for ${file}`);
        if (file.endsWith(".js")) {
          try {
            new Function(text.replace(/^#!.*\n/, ""));
          } catch (err: any) {
            throw new Error(`syntax check failed for ${file}: ${err?.message || String(err)}`);
          }
        } else if (file.endsWith(".json")) {
          try {
            JSON.parse(text);
          } catch (err: any) {
            throw new Error(`invalid JSON in ${file}: ${err?.message || String(err)}`);
          }
        } else if (file.endsWith(".sh")) {
          if (!/^#!.*\b(ba)?sh\b/.test(text)) throw new Error(`${file} is not a shell script`);
        }
        const tmpPath = path.join(rootDir, `.${file.replace(/\//g, "_")}.tmp.${process.pid}`);
        fs.writeFileSync(tmpPath, text, "utf8");
        if (file.endsWith(".sh")) {
          let parsed = true;
          try {
            execFileSync("bash", ["-n", tmpPath], {
              stdio: "ignore",
              timeout: 5000,
            });
          } catch (err: any) {
            if (!err || err.code !== "ENOENT") {
              try {
                fs.unlinkSync(tmpPath);
              } catch {}
              parsed = false;
              throw new Error(`syntax check failed for ${file}: ${err?.message || String(err)}`);
            }
          }
          if (parsed) fs.chmodSync(tmpPath, 0o755);
        }
        tmpFiles.push({ tmpPath, targetPath: path.join(rootDir, file) });
      }

      const incoming = tmpFiles.find((f) => path.basename(f.targetPath) === "server.js");
      if (incoming) {
        const declared = new Set(tmpFiles.map((f) => path.basename(f.targetPath)));
        for (const file of localRequires(fs.readFileSync(incoming.tmpPath, "utf8"))) {
          if (declared.has(file) || fs.existsSync(path.join(rootDir, file))) continue;
          const res = await fetchFn(`${UPDATE_BASE_URL}/${file}?cb=${cb}`, {
            headers: { "Cache-Control": "no-cache" },
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status} fetching required module ${file}`);
          const text = await res.text();
          if (!text || text.length < 20) throw new Error(`empty response for required module ${file}`);
          try {
            new Function(text.replace(/^#!.*\n/, ""));
          } catch (err: any) {
            throw new Error(`syntax check failed for required module ${file}: ${err?.message || String(err)}`);
          }
          const tmpPath = path.join(rootDir, `.${file.replace(/\//g, "_")}.tmp.${process.pid}`);
          fs.writeFileSync(tmpPath, text, "utf8");
          tmpFiles.push({ tmpPath, targetPath: path.join(rootDir, file) });
          declared.add(file);
          console.log(`[AlphaWay] Staged newly required module ${file}`);
        }
      }

      for (const { tmpPath, targetPath } of tmpFiles) {
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        fs.renameSync(tmpPath, targetPath);
      }
      console.log(
        `[AlphaWay] Self-updated ${VERSION} → ${remoteVersion}; exiting for service restart.`
      );
      if (serverInstance && typeof serverInstance.close === "function") {
        serverInstance.close(() => process.exit(0));
      }
      setTimeout(() => process.exit(0), 2000).unref();
      return { updated: true, version: remoteVersion };
    } catch (err: any) {
      for (const { tmpPath } of tmpFiles) {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {}
      }
      console.warn(`[AlphaWay] Self-update skipped: ${err?.message || String(err)}`);
      return { updated: false, error: err?.message || String(err) };
    } finally {
      updateInFlight = null;
    }
  })();
  return updateInFlight;
}
