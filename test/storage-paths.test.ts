import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseEnvFile,
  resolveDatabasePath,
  resolveStoragePaths,
} from "../src/core/storage-paths";

describe("9router-style SQLite storage path contract", () => {
  it("uses the AlphaWay platform data root and the shared db/data.sqlite layout", () => {
    const linux = resolveStoragePaths({
      env: {},
      envFile: {},
      cwd: "/workspace",
      homeDir: "/home/operator",
      platform: "linux",
    });

    expect(linux.dataDir).toBe("/home/operator/.alphaway");
    expect(linux.databasePath).toBe("/home/operator/.alphaway/db/data.sqlite");

    const windows = resolveStoragePaths({
      env: { APPDATA: "/profile/Roaming" },
      envFile: {},
      cwd: "/workspace",
      homeDir: "/profile",
      platform: "win32",
    });
    expect(windows.dataDir).toBe(path.join("/profile/Roaming", "AlphaWay"));
    expect(windows.databasePath).toBe(path.join("/profile/Roaming", "AlphaWay", "db", "data.sqlite"));
  });

  it("prioritizes process environment over .env, including compatibility aliases", () => {
    const resolved = resolveStoragePaths({
      env: {
        ALPHAWAY_STATE_DIR: "/runtime/legacy-root",
        ALPHAWAY_DB_PATH: "/runtime/legacy.sqlite",
      },
      envFile: {
        DATA_DIR: "/env-file/new-root",
        DB_PATH: "/env-file/data.sqlite",
      },
      cwd: "/workspace",
      homeDir: "/home/operator",
      platform: "linux",
    });

    expect(resolved.dataDir).toBe("/runtime/legacy-root");
    expect(resolved.databasePath).toBe("/runtime/legacy.sqlite");
  });

  it("gives canonical DATA_DIR and DB_PATH precedence over compatibility aliases", () => {
    const resolved = resolveStoragePaths({
      env: {
        DATA_DIR: "/runtime/canonical-root",
        ALPHAWAY_STATE_DIR: "/runtime/old-root",
        DB_PATH: "/runtime/canonical.sqlite",
        ALPHAWAY_DB_PATH: "/runtime/old.sqlite",
      },
      envFile: {},
      cwd: "/workspace",
      homeDir: "/home/operator",
      platform: "linux",
    });

    expect(resolved.dataDir).toBe("/runtime/canonical-root");
    expect(resolved.databasePath).toBe("/runtime/canonical.sqlite");
  });

  it("parses conventional .env assignments, quotes, exports and inline comments", () => {
    expect(parseEnvFile([
      "DATA_DIR=/srv/alphaway # persistent state",
      "export DB_PATH=\"/srv/alphaway/db/data.sqlite\"",
      "ALPHAWAY_LABEL='Gateway # one'",
      "EMPTY=",
      "NOT_AN_ASSIGNMENT",
    ].join("\n"))).toEqual({
      DATA_DIR: "/srv/alphaway",
      DB_PATH: "/srv/alphaway/db/data.sqlite",
      ALPHAWAY_LABEL: "Gateway # one",
      EMPTY: "",
    });
  });

  it("preserves the SQLite :memory: special path", () => {
    const resolved = resolveStoragePaths({
      env: { DB_PATH: ":memory:" },
      envFile: {},
      cwd: "/workspace",
      homeDir: "/home/operator",
      platform: "linux",
    });
    expect(resolved.databasePath).toBe(":memory:");
    expect(resolved.explicitDatabasePath).toBe(true);
  });

  it("recognizes existing DB_PATH directory layouts in 9router-go order", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-db-path-"));
    const old = {
      dataDir: process.env.DATA_DIR,
      dbPath: process.env.DB_PATH,
      alphaState: process.env.ALPHAWAY_STATE_DIR,
      opencodeState: process.env.OPENCODE_BRIDGE_STATE_DIR,
      oldDbPath: process.env.ALPHAWAY_DB_PATH,
      envFile: process.env.ALPHAWAY_ENV_FILE,
    };
    const emptyEnv = path.join(directory, "empty.env");
    fs.writeFileSync(emptyEnv, "");

    try {
      process.env.ALPHAWAY_ENV_FILE = emptyEnv;
      process.env.DB_PATH = directory;
      delete process.env.DATA_DIR;
      delete process.env.ALPHAWAY_STATE_DIR;
      delete process.env.OPENCODE_BRIDGE_STATE_DIR;
      delete process.env.ALPHAWAY_DB_PATH;

      const preferred = path.join(directory, "db", "data.sqlite");
      const second = path.join(directory, "data.sqlite");
      const third = path.join(directory, "9router.db");
      const alpha = path.join(directory, "alphaway.sqlite");
      fs.mkdirSync(path.dirname(preferred), { recursive: true });
      fs.writeFileSync(preferred, "");
      fs.writeFileSync(second, "");
      fs.writeFileSync(third, "");
      fs.writeFileSync(alpha, "");

      expect(resolveDatabasePath()).toBe(preferred);
      fs.rmSync(preferred);
      expect(resolveDatabasePath()).toBe(second);
      fs.rmSync(second);
      expect(resolveDatabasePath()).toBe(third);
      fs.rmSync(third);
      expect(resolveDatabasePath()).toBe(alpha);
    } finally {
      if (old.dataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = old.dataDir;
      if (old.dbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = old.dbPath;
      if (old.alphaState === undefined) delete process.env.ALPHAWAY_STATE_DIR; else process.env.ALPHAWAY_STATE_DIR = old.alphaState;
      if (old.opencodeState === undefined) delete process.env.OPENCODE_BRIDGE_STATE_DIR; else process.env.OPENCODE_BRIDGE_STATE_DIR = old.opencodeState;
      if (old.oldDbPath === undefined) delete process.env.ALPHAWAY_DB_PATH; else process.env.ALPHAWAY_DB_PATH = old.oldDbPath;
      if (old.envFile === undefined) delete process.env.ALPHAWAY_ENV_FILE; else process.env.ALPHAWAY_ENV_FILE = old.envFile;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps an existing AlphaWay database active until the operator migrates its path", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-old-db-"));
    const old = {
      dataDir: process.env.DATA_DIR,
      dbPath: process.env.DB_PATH,
      alphaState: process.env.ALPHAWAY_STATE_DIR,
      opencodeState: process.env.OPENCODE_BRIDGE_STATE_DIR,
      oldDbPath: process.env.ALPHAWAY_DB_PATH,
      envFile: process.env.ALPHAWAY_ENV_FILE,
    };
    const emptyEnv = path.join(directory, "empty.env");
    fs.writeFileSync(emptyEnv, "");

    try {
      process.env.ALPHAWAY_ENV_FILE = emptyEnv;
      process.env.DATA_DIR = directory;
      delete process.env.DB_PATH;
      delete process.env.ALPHAWAY_STATE_DIR;
      delete process.env.OPENCODE_BRIDGE_STATE_DIR;
      delete process.env.ALPHAWAY_DB_PATH;

      const oldDatabase = path.join(directory, "alphaway.sqlite");
      const newDatabase = path.join(directory, "db", "data.sqlite");
      fs.writeFileSync(oldDatabase, "");
      expect(resolveDatabasePath()).toBe(oldDatabase);

      fs.mkdirSync(path.dirname(newDatabase), { recursive: true });
      fs.writeFileSync(newDatabase, "");
      expect(resolveDatabasePath()).toBe(newDatabase);
    } finally {
      if (old.dataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = old.dataDir;
      if (old.dbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = old.dbPath;
      if (old.alphaState === undefined) delete process.env.ALPHAWAY_STATE_DIR; else process.env.ALPHAWAY_STATE_DIR = old.alphaState;
      if (old.opencodeState === undefined) delete process.env.OPENCODE_BRIDGE_STATE_DIR; else process.env.OPENCODE_BRIDGE_STATE_DIR = old.opencodeState;
      if (old.oldDbPath === undefined) delete process.env.ALPHAWAY_DB_PATH; else process.env.ALPHAWAY_DB_PATH = old.oldDbPath;
      if (old.envFile === undefined) delete process.env.ALPHAWAY_ENV_FILE; else process.env.ALPHAWAY_ENV_FILE = old.envFile;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("decodes double-quoted escapes once and preserves unknown escapes", () => {
    const parsed = parseEnvFile(String.raw`PATH="C:\\Users\\Nata"
NEWLINE="line\nnext"
LITERAL="\\n"
UNKNOWN="\\q"
QUOTED="say \"hi\""

    expect(parsed).toEqual({
      PATH: "C:\\Users\\Nata",
      NEWLINE: "line\nnext",
      LITERAL: "\\n",
      UNKNOWN: "\\q",
      QUOTED: 'say "hi"',
    });
  });
});
