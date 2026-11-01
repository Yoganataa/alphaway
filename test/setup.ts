import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Proxy modules can initialize SQLite during import. Preload this before
// test modules so no suite can touch a developer's ~/.alphaway state.
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-unit-"));
process.env.ALPHAWAY_STATE_DIR = stateDir;
process.env.ALPHAWAY_DB_PATH = path.join(stateDir, "alphaway.sqlite");
process.env.ALPHAWAY_ENCRYPTION_KEY = "";
process.env.API_KEY = "";
process.env.BRIDGE_API_KEY = "";
process.env.TRUST_PROXY = "0";

process.on("exit", () => {
  try { fs.rmSync(stateDir, { recursive: true, force: true }); } catch {}
});