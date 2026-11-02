"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execSync } = require("child_process");

function extractQuickTunnelUrl(outputLine) {
  const candidate = outputLine.match(/https:\/\/[^\s"'<>]+/i)?.[0];
  if (!candidate) return null;

  const value = candidate.replace(/[),.;\]}]+$/, "");
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const suffix = ".trycloudflare.com";
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !hostname.endsWith(suffix) ||
      hostname.length <= suffix.length
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function findCloudflaredBinary() {
  if (process.env.CLOUDFLARED_BIN && fs.existsSync(process.env.CLOUDFLARED_BIN)) {
    return process.env.CLOUDFLARED_BIN;
  }

  // 1. Check local directory
  const localBin = path.join(__dirname, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  if (fs.existsSync(localBin)) return localBin;

  // 2. Check standard PATH
  try {
    const cmd = process.platform === "win32" ? "where.exe cloudflared" : "which cloudflared";
    const res = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const firstLine = res.split(/\r?\n/)[0].trim();
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch {}

  // 3. Check well-known locations
  const candidates = process.platform === "win32"
    ? [
        "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
        "C:\\Program Files\\cloudflared\\cloudflared.exe",
        path.join(os.homedir(), "scoop", "shims", "cloudflared.exe"),
      ]
    : [
        "/usr/local/bin/cloudflared",
        "/usr/bin/cloudflared",
        path.join(os.homedir(), ".local", "bin", "cloudflared"),
        path.join(os.homedir(), "bin", "cloudflared"),
      ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return null;
}

async function autoDownloadCloudflared(targetDir = __dirname) {
  const platform = process.platform;
  const arch = process.arch;
  let filename = "";

  if (platform === "linux") {
    if (arch === "x64") filename = "cloudflared-linux-amd64";
    else if (arch === "arm64") filename = "cloudflared-linux-arm64";
    else if (arch === "arm") filename = "cloudflared-linux-arm";
  } else if (platform === "darwin") {
    filename = arch === "arm64" ? "cloudflared-darwin-arm64.tgz" : "cloudflared-darwin-amd64.tgz";
  } else if (platform === "win32") {
    filename = arch === "x64" ? "cloudflared-windows-amd64.exe" : "cloudflared-windows-386.exe";
  }

  if (!filename) return null;

  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${filename}`;
  const outName = platform === "win32" ? "cloudflared.exe" : "cloudflared";
  const outPath = path.join(targetDir, outName);

  console.log(`[AlphaWay] cloudflared not found. Auto-downloading from ${url}...`);
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    if (filename.endsWith(".tgz")) {
      const tarPath = path.join(targetDir, "cloudflared.tgz");
      fs.writeFileSync(tarPath, buffer);
      execSync(`tar -xzf "${tarPath}" -C "${targetDir}"`);
      try { fs.unlinkSync(tarPath); } catch {}
    } else {
      fs.writeFileSync(outPath, buffer);
      if (platform !== "win32") {
        fs.chmodSync(outPath, 0o755);
      }
    }
    console.log(`[AlphaWay] cloudflared downloaded successfully to ${outPath}`);
    return outPath;
  } catch (err) {
    console.warn(`[AlphaWay] Failed to auto-download cloudflared: ${err.message}`);
    return null;
  }
}

function startTunnel(options = {}) {
  const port = options.port || parseInt(process.env.PORT || "20129", 10);
  const host = options.host || process.env.HOST || "127.0.0.1";
  const publicUrl = options.publicUrl || process.env.PUBLIC_URL || "";
  const token = options.token || process.env.CLOUDFLARE_TUNNEL_TOKEN;
  const tunnelId = options.tunnelId || process.env.CLOUDFLARE_TUNNEL_ID;
  const accountTag = options.accountTag || process.env.CLOUDFLARE_ACCOUNT_TAG;
  const tunnelSecret = options.tunnelSecret || process.env.CLOUDFLARE_TUNNEL_SECRET;

  let bin = findCloudflaredBinary();
  if (!bin) {
    console.error("[AlphaWay] Error: cloudflared binary not found on this system.");
    console.error("[AlphaWay] Please install cloudflared or place the binary in your PATH or project directory.");
    return null;
  }

  let args = [];
  let tempFilesToClean = [];

  if (token) {
    // Mode 1: Token-based Tunnel
    console.log("[AlphaWay] Starting Cloudflare Tunnel using token...");
    args = ["tunnel", "run", "--token", token.trim()];
  } else if (tunnelId && accountTag && tunnelSecret) {
    // Mode 2: Self-contained credentials from .env
    console.log(`[AlphaWay] Configuring Cloudflare Named Tunnel ${tunnelId}...`);
    const tunnelDir = path.join(os.tmpdir(), "alphaway-tunnel");
    if (!fs.existsSync(tunnelDir)) {
      try { fs.mkdirSync(tunnelDir, { recursive: true }); } catch {}
    }

    const homeCreds = path.join(os.homedir(), ".cloudflared", `${tunnelId}.json`);
    let credsFile = homeCreds;

    if (!fs.existsSync(homeCreds)) {
      credsFile = path.join(tunnelDir, `${tunnelId}.json`);
      const credsData = JSON.stringify({
        AccountTag: accountTag.trim(),
        TunnelSecret: tunnelSecret.trim(),
        TunnelID: tunnelId.trim(),
      }, null, 2);
      try { fs.writeFileSync(credsFile, credsData, "utf8"); } catch {}
    }

    let targetHostname = "localhost";
    if (publicUrl) {
      try {
        targetHostname = new URL(publicUrl).hostname;
      } catch {
        targetHostname = publicUrl.replace(/^https?:\/\//i, "").split("/")[0];
      }
    }

    const configYamlPath = path.join(tunnelDir, `alphaway-${tunnelId}.yml`);
    const configYamlContent = [
      `tunnel: ${tunnelId}`,
      `credentials-file: ${credsFile.replace(/\\/g, "/")}`,
      `ingress:`,
      `  - hostname: ${targetHostname}`,
      `    service: http://${host}:${port}`,
      `  - service: http_status:404`,
      ``,
    ].join("\n");

    try { fs.writeFileSync(configYamlPath, configYamlContent, "utf8"); } catch {}
    args = ["tunnel", "--config", configYamlPath, "run"];
  } else if (tunnelId) {
    // Mode 3: Named tunnel ID with existing local config
    console.log(`[AlphaWay] Starting Cloudflare Named Tunnel ${tunnelId}...`);
    args = ["tunnel", "run", tunnelId];
  } else {
    // Mode 4: Quick / Ephemeral Tunnel
    console.log(`[AlphaWay] No tunnel credentials in .env. Starting Quick Cloudflare Tunnel for http://${host}:${port}...`);
    args = ["tunnel", "--url", `http://${host}:${port}`];
  }

  const child = spawn(bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let connectedReported = false;

  const handleOutput = (data) => {
    const text = data.toString();
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      if (line.includes("Registered tunnel connection") || line.includes("Connection") && line.includes("registered")) {
        if (!connectedReported) {
          connectedReported = true;
          console.log(`[AlphaWay] Cloudflare Tunnel connected! Public URL: ${publicUrl || "(active)"}`);
        }
      } else {
        const quickTunnelUrl = extractQuickTunnelUrl(line);
        if (quickTunnelUrl) {
          console.log(`[AlphaWay] Quick Tunnel URL: ${quickTunnelUrl}`);
        }
        if ((line.includes("ERR") || line.includes("error") || line.includes("failed"))
          && !line.includes("Retrying") && !line.includes("context canceled")) {
          console.warn(`[AlphaWay] [tunnel] ${line.trim()}`);
        }
      }
    }
  };

  child.stdout.on("data", handleOutput);
  child.stderr.on("data", handleOutput);

  child.on("error", (err) => {
    console.error(`[AlphaWay] Failed to start cloudflared: ${err.message}`);
  });

  child.on("exit", (code, signal) => {
    if (signal !== "SIGTERM" && signal !== "SIGINT") {
      console.warn(`[AlphaWay] Cloudflare Tunnel exited with code ${code || signal}`);
    }
  });

  const cleanup = () => {
    if (child && !child.killed) {
      try { child.kill("SIGTERM"); } catch {}
    }
  };

  process.once("exit", cleanup);
  process.once("SIGINT", () => { cleanup(); process.exit(0); });
  process.once("SIGTERM", () => { cleanup(); process.exit(0); });

  return {
    process: child,
    stop: cleanup,
  };
}

module.exports = {
  findCloudflaredBinary,
  autoDownloadCloudflared,
  extractQuickTunnelUrl,
  startTunnel,
};

if (require.main === module) {
  startTunnel();
}
