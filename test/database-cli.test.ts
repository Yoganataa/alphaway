import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("SQLite backup and restore operator CLI", () => {
  it("exposes explicit backup and restore package scripts", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["db:backup"]).toBe("bun src/cli/database.ts backup");
    expect(pkg.scripts["db:restore"]).toBe("bun src/cli/database.ts restore");
  });

  it("requires encrypted .awenc snapshots and documents the stopped-service restore contract", () => {
    const cli = fs.readFileSync(path.join(ROOT, "src", "cli", "database.ts"), "utf8");
    expect(cli).toContain('command === "backup"');
    expect(cli).toContain('command === "restore"');
    expect(cli).toContain('backupPath.endsWith(".awenc")');
    expect(cli).toContain("assertNoManagedDaemon");
    expect(cli).toContain('process.argv.slice(2).filter((argument) => argument !== "--")');
    expect(cli).toContain("restoreDatabaseBackup");
    expect(cli).toContain("createMigrationBackup");
  });
});
