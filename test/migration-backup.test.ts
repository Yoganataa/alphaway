import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMigrationBackup, restoreDatabaseBackup } from "../src/core/migrations/backup";

function withTempDirectory<T>(run: (directory: string) => T): T {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "alphaway-backup-"));
  try {
    return run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe("SQLite migration backup and restore", () => {
  it("creates a consistent file-backed backup and restores it after a destructive change", () => {
    withTempDirectory((directory) => {
      // Apostrophe and whitespace verify VACUUM INTO path escaping.
      const databasePath = path.join(directory, "AlphaWay operator's data.sqlite");
      const db = new Database(databasePath);
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("CREATE TABLE checkpoint_state (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
      db.prepare("INSERT INTO checkpoint_state (value) VALUES (?)").run("before-migration");

      const backupPath = createMigrationBackup(db, databasePath, "schema-rebuild");
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.statSync(backupPath).size).toBeGreaterThan(0);

      if (process.platform !== "win32") {
        expect(fs.statSync(path.dirname(backupPath)).mode & 0o777).toBe(0o700);
        expect(fs.statSync(backupPath).mode & 0o777).toBe(0o600);
      }

      // Simulate a destructive migration after the backup was written.
      db.prepare("UPDATE checkpoint_state SET value = ? WHERE id = 1").run("after-migration");
      db.close();

      restoreDatabaseBackup(backupPath, databasePath);

      const restored = new Database(databasePath);
      try {
        const row = restored
          .prepare("SELECT value FROM checkpoint_state WHERE id = 1")
          .get() as { value: string } | null;
        expect(row?.value).toBe("before-migration");

        const integrity = restored.query("PRAGMA quick_check").get() as Record<string, string>;
        expect(Object.values(integrity)[0]).toBe("ok");
      } finally {
        restored.close();
      }

      const previousCopies = fs.readdirSync(directory).filter((name) =>
        name.includes(".pre-restore-")
      );
      expect(previousCopies).toHaveLength(1);

      const previous = new Database(path.join(directory, previousCopies[0]), { readonly: true });
      try {
        const row = previous
          .prepare("SELECT value FROM checkpoint_state WHERE id = 1")
          .get() as { value: string } | null;
        expect(row?.value).toBe("after-migration");
      } finally {
        previous.close();
      }
    });
  });

  it("rejects a corrupt backup without replacing the current database", () => {
    withTempDirectory((directory) => {
      const databasePath = path.join(directory, "alphaway.sqlite");
      const corruptBackup = path.join(directory, "corrupt.sqlite");
      const db = new Database(databasePath);
      db.exec("CREATE TABLE checkpoint_state (value TEXT NOT NULL)");
      db.prepare("INSERT INTO checkpoint_state VALUES (?)").run("keep-current");
      db.close();

      fs.writeFileSync(corruptBackup, "not a SQLite database", "utf8");
      expect(() => restoreDatabaseBackup(corruptBackup, databasePath)).toThrow();

      const unchanged = new Database(databasePath, { readonly: true });
      try {
        const row = unchanged.prepare("SELECT value FROM checkpoint_state").get() as
          | { value: string }
          | null;
        expect(row?.value).toBe("keep-current");
      } finally {
        unchanged.close();
      }
    });
  });

  it("refuses destructive migration backups for in-memory databases", () => {
    const db = new Database(":memory:");
    try {
      expect(() => createMigrationBackup(db, ":memory:", "test")).toThrow(
        /in-memory database/
      );
    } finally {
      db.close();
    }
  });
});
