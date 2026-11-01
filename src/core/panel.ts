/**
 * AlphaWay Web Management Panel & Dashboard Template (TypeScript)
 * Server-rendered fallback document and testable markup generator.
 */

export function escapeHtml(str: string | null | undefined): string {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderPanel(
  state: {
    mode?: string;
    proxy?: string | null;
    source?: string;
    configPath?: string;
    error?: string | null;
  } = { mode: "direct" },
  info: {
    version?: string;
    port?: number;
    publicUrl?: string;
    apiKeyConfigured?: boolean;
    models?: any[];
  } = {}
): string {
  const mode = state.mode || "direct";
  const proxyVal = state.proxy || "";
  const publicUrl = (info.publicUrl || "").trim();
  const apiKeyConfigured = Boolean(info.apiKeyConfigured);
  const version = info.version || "0.2.0";
  const port = info.port || 20129;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Proxy egress · AlphaWay AI Gateway Dashboard</title>
  <style>
    :root { --font-mono: monospace; --bg: #121212; --text: #eee; }
    body { background: var(--bg); color: var(--text); font-family: sans-serif; margin: 0; padding: 20px; }
    .card { background: #1e1e1e; border: 1px solid #333; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    button { padding: 8px 16px; cursor: pointer; }
  </style>
</head>
<body>
  <div id="view-egress" class="view-content">
    <div class="card">
      <div class="card-header">
        <div class="card-title">Egress Proxy Status</div>
        <span class="pill">${escapeHtml(mode === "pool" ? "Pool Active" : mode === "proxy" ? "Proxy Active" : "Direct IP")}</span>
      </div>

      <div style="margin: 14px 0;">
        <div>Active Proxy</div>
        <code id="host">${escapeHtml(proxyVal || "No active proxy (direct host IP)")}</code>
        <span id="mode" hidden>${escapeHtml(mode)}</span>
        <span id="note" hidden>${escapeHtml(state.error || "")}</span>
      </div>

      <div>
        <h4>Single Proxy Configuration</h4>
        <form id="form" novalidate onsubmit="return false;">
          <div style="display:flex; gap:8px;">
            <input type="text" id="proxy-url" name="proxy-url" placeholder="http://user:pass@host:port" value="${escapeHtml(proxyVal)}" style="flex:1;">
            <button type="button" class="primary" id="save">Save and Apply</button>
            <button type="button" id="test">Test Connection</button>
            <button type="button" class="danger" id="direct">Disable Proxy</button>
          </div>
          <div id="report" class="report" role="status" aria-live="polite" hidden></div>
        </form>
      </div>
    </div>
  </div>

  <div id="auth-overlay" hidden>
    <input id="auth-key-input" type="password">
    <button id="btn-auth-submit">Login</button>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const urlInput = $("proxy-url");
    const saveBtn = $("save");
    const testBtn = $("test");
    const directBtn = $("direct");
    const report = $("report");
    const form = $("form");

    if (saveBtn) saveBtn.addEventListener("click", () => {});
    if (testBtn) testBtn.addEventListener("click", () => {});
    if (directBtn) directBtn.addEventListener("click", () => {});
    if (form) form.addEventListener("submit", (e) => e.preventDefault());
  </script>
</body>
</html>`;
}
