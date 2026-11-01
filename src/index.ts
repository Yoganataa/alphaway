/**
 * AlphaWay Entry Point (Bun + Hono + TypeScript)
 * Next-Gen High-Performance Gateway with BoringSSL TLS Parity
 */

// Upstream inspects the TLS ClientHello (BoringSSL). Node (OpenSSL) earns 403 FreeTierError.
if (typeof (globalThis as any).Bun === "undefined") {
  if (process.env.ALLOW_NODE !== "1") {
    console.error(
      "AlphaWay requires Bun (https://bun.sh).\n" +
      "Upstream inspects TLS ClientHello (BoringSSL). Node (OpenSSL) earns 403 FreeTierError.\n" +
      "Measurement: Bun 6/6 pass, Node 0/6 pass.\n" +
      "Run with: bun src/index.ts"
    );
    process.exit(1);
  }
}

import { app } from "./app";
import { handleDaemonCli } from "./features/daemon";
import { startTunnel } from "./features/tunnel";
import { opencode } from "./providers";
import { checkAndApplyUpdate, repairMissingModules } from "./core/updater";

const PORT = parseInt(process.env.PORT || "20129", 10);
const HOST = process.env.HOST || "127.0.0.1";

// 0. Handle Version and Help CLI flags
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log("AlphaWay v0.0.1 (Bun-native)");
  process.exit(0);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
AlphaWay v0.0.1 - High-Performance Universal AI Gateway & Security Router

Usage:
  alphaway [options]

Options:
  -d, --daemon     Run AlphaWay as a background daemon process
  --status         Check the status of the running AlphaWay daemon
  --stop           Stop the running AlphaWay daemon
  --tunnel         Start an automated Cloudflare Tunnel for secure ingress
  -v, --version    Show version number (0.0.1)
  -h, --help       Show this help message

Environment Variables:
  PORT             Port to listen on (default: 20129)
  HOST             Host to bind to (default: 127.0.0.1)
  API_KEY          Bearer token / x-api-key authentication for endpoints
`);
  process.exit(0);
}

// 1. Handle Daemon CLI commands (--stop, --status, --daemon, -d)
handleDaemonCli(PORT, HOST);

// 2. Handle Cloudflare Tunnel (--tunnel)
if (process.argv.includes("--tunnel") || process.env.TUNNEL === "1") {
  startTunnel({ port: PORT, host: HOST });
}

console.log("\n" + "=".repeat(60));
console.log("       AlphaWay (Next-Gen: Bun + TS + Hono + Svelte 5)       ");
console.log("=".repeat(60));
console.log(`🚀 Gateway Server : http://${HOST}:${PORT}`);
console.log(`🌐 Web Dashboard  : http://${HOST}:${PORT}/`);
console.log(`🔌 OpenAI Base URL: http://${HOST}:${PORT}/v1`);
console.log(`🩺 Health Check   : http://${HOST}:${PORT}/health`);
console.log(`🔒 BoringSSL TLS  : Active (Native Parity)`);
console.log("=".repeat(60) + "\n");

// Start server on configured host and port
const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
});

// Start background services (non-blocking)
repairMissingModules().catch(() => {});
opencode.discoverModels().catch(() => {});

const discoveryTimer = setInterval(() => {
  opencode.discoverModels().catch(() => {});
}, 5 * 60 * 1000);
if (typeof discoveryTimer.unref === "function") discoveryTimer.unref();

const updateTimer = setInterval(() => {
  checkAndApplyUpdate(server).catch(() => {});
}, 6 * 60 * 60 * 1000);
if (typeof updateTimer.unref === "function") updateTimer.unref();

export { server, app, PORT, HOST };
