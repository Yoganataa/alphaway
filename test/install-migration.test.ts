import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("current AlphaWay installer and distribution contract", () => {
  it("targets the current Bun and TypeScript source tree", () => {
    const installer = read("install.sh");
    expect(installer).toContain("src/index.ts");
    expect(installer).toContain("bun.lock");
    expect(installer).toContain("codeload.github.com");
    expect(installer).not.toContain("fetch server.js");
    expect(installer).not.toContain("fetch identity.js");
  });

  it("installs locked dependencies and builds before replacing the installed app", () => {
    const installer = read("install.sh");
    const installAt = installer.indexOf("install --frozen-lockfile");
    const buildAt = installer.indexOf("run build");
    const swapAt = installer.indexOf('mv "$STAGED_APP" "$APPDIR"');
    expect(installAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(installAt);
    expect(swapAt).toBeGreaterThan(buildAt);
  });

  it("keeps user configuration and database state outside the replaceable app directory", () => {
    const installer = read("install.sh");
    expect(installer).toContain('APPDIR="$BINDIR/app"');
    expect(installer).toContain('"$BINDIR/.env"');
    expect(installer).toContain("DATA_DIR=$DATA_DIR");
    expect(installer.match(/Environment=\"DATA_DIR=\$DATA_DIR\"/g)?.length).toBe(2);
    expect(installer).toContain(".backup-app-");
  });

  it("binds an empty .env DATA_DIR to BINDIR for manual starts", () => {
    const installer = read("install.sh");
    expect(installer).toContain('configured_data_dir=""');
    expect(installer).toContain('DATA_DIR=*) configured_data_dir="${env_line#DATA_DIR=}" ;;');
    expect(installer).toContain('printf \'DATA_DIR=%s\\n\' "$BINDIR"');
    expect(installer).toContain('mv "$ENV_TMP" "$BINDIR/.env"');
  });

  it("validates TLS compatibility and the standalone binary before installation", () => {
    const installer = read("install.sh");
    expect(installer).toContain("run fingerprint:check");
    expect(installer).toContain("run build");
    expect(installer).toContain("./alphaway --version");
    expect(installer).toContain('MIN_BUN_VERSION="1.4.4"');
  });

  it("retires legacy system and user services before replacing the installed app", () => {
    const installer = read("install.sh");
    const definitionAt = installer.indexOf("retire_legacy_systemd_services() {");
    const callAt = installer.lastIndexOf("    retire_legacy_systemd_services");
    const portCheckAt = installer.indexOf('if port_is_listening; then');
    const swapAt = installer.indexOf('mv "$STAGED_APP" "$APPDIR"');

    expect(definitionAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(definitionAt);
    expect(installer).toContain("opencode-bridge.service");
    expect(installer).toContain("opencode-free-bridge.service");
    expect(installer).toContain('systemctl disable --now "$name"');
    expect(installer).toContain('systemctl --user disable --now "$name"');
    expect(installer).toContain('.retired-$stamp');
    expect(installer).toContain("Could not disable legacy system service");
    expect(callAt).toBeLessThan(portCheckAt);
    expect(callAt).toBeLessThan(swapAt);
  });

  it("supports install-only smoke tests without starting a service", () => {
    const installer = read("install.sh");
    expect(installer).toContain("NO_START=");
    expect(installer).toContain('if [ "$NO_START" = "1" ]');
    expect(installer).toContain("NO_SERVICE=");
  });

  it("preserves service management for systemd and launchd", () => {
    const installer = read("install.sh");
    expect(installer).toContain("install_system_service");
    expect(installer).toContain("install_user_service");
    expect(installer).toContain("install_launchd_service");
    expect(installer).toContain('ExecStart="$APPDIR/alphaway"');
  });

  it("does not use the obsolete root-level JavaScript server layout", () => {
    const installer = read("install.sh");
    for (const legacyPath of [
      "server.js",
      "identity.js",
      "gate-drill.js",
      "transport-fingerprint.js",
      "proxy.js",
      "panel.js",
    ]) {
      expect(installer).not.toContain("fetch " + legacyPath);
      expect(installer).not.toContain("$BINDIR/" + legacyPath);
    }
  });

  it("uses one deterministic dashboard asset path in Vite and Hono", () => {
    const vite = read("vite.config.ts");
    const dashboard = read("src/routes/dashboard.ts");
    const pkg = JSON.parse(read("package.json"));

    expect(vite).toContain("ALPHAWAY_DASHBOARD_DIR");
    expect(dashboard).toContain("ALPHAWAY_DASHBOARD_DIR");
    expect(dashboard).toContain('path.resolve(import.meta.dir, isStandalone ? "dist" : "../../dist")');
    expect(dashboard).not.toContain("LEGACY_DIST");
    expect(pkg.scripts["build:bin"]).toContain("--asset ./dist");
    expect(pkg.scripts.build).toContain("build:ui");
    expect(pkg.scripts.build).toContain("build:bin");
  });

  it("splits deterministic unit and browser E2E commands", () => {
    const pkg = JSON.parse(read("package.json"));
    const ci = read(".github/workflows/ci.yml");

    expect(pkg.scripts["test:unit"]).toBe("bun run build:ui && bun test --preload ./test/setup.ts test/*.test.ts");
    expect(pkg.scripts["test:e2e"]).toBe("bun test test/e2e/");
    expect(ci).toContain("bun run test:unit");
    expect(ci).toContain("bun run test:e2e");
    expect(ci).toContain("playwright install --with-deps chromium");
    expect(ci).not.toContain("npm run test:node");
    expect(ci).not.toContain("bun test test/*.test.js");
  });

  it("syntax-checks the installer with Bash when Bash is available", () => {
    if (process.platform === "win32") return;
    expect(() => execFileSync("bash", ["-n", path.join(ROOT, "install.sh")])).not.toThrow();
  });
});
