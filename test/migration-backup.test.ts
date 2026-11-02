import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMigrationBackup, restoreDatabaseBackup, encryptExistingMigrationBackups } from "../src/core/migrations/backup";
import { encryptSecret, isEncryptedSecret } from "../src/core/secrets";

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
      expect(backupPath.endsWith(".sqlite.awenc")).toBe(true);
      expect(fs.existsSync(backupPath)).toBe(true);
      const encryptedBackup = fs.readFileSync(backupPath, "utf8");
      expect(isEncryptedSecret(encryptedBackup.trim())).toBe(true);
      expect(encryptedBackup).not.toContain("before-migration");

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

      const backupDir = path.join(directory, "backups");
      const previousCopies = fs.readdirSync(backupDir).filter((name) =>
        name.includes("pre-restore") && name.endsWith(".sqlite.awenc")
      );
      expect(previousCopies).toHaveLength(1);
      const previousBackup = path.join(backupDir, previousCopies[0]);
      expect(isEncryptedSecret(fs.readFileSync(previousBackup, "utf8").trim())).toBe(true);

      const previousRestorePath = path.join(directory, "previous-state.sqlite");
      restoreDatabaseBackup(previousBackup, previousRestorePath);
      const previous = new Database(previousRestorePath, { readonly: true });
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
      expect(fs.existsSync(corruptBackup)).toBe(false);
      expect(isEncryptedSecret(fs.readFileSync(corruptBackup + ".awenc", "utf8").trim())).toBe(true);

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

  it("encrypts historical plaintext migration backups in place while retaining restorable data", () => {
    withTempDirectory((directory) => {
      const backupDir = path.join(directory, "backups");
      fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
      const legacyPath = path.join(backupDir, "alphaway-before-old-migration.sqlite");
      const legacyDb = new Database(legacyPath);
      legacyDb.exec("CREATE TABLE checkpoint_state (value TEXT NOT NULL)");
      legacyDb.prepare("INSERT INTO checkpoint_state VALUES (?)").run("legacy-backup-value");
      legacyDb.close();

      const encrypted = encryptExistingMigrationBackups(backupDir);
      expect(encrypted).toEqual([legacyPath + ".awenc"]);
      expect(fs.existsSync(legacyPath)).toBe(false);
      expect(isEncryptedSecret(fs.readFileSync(legacyPath + ".awenc", "utf8").trim())).toBe(true);

      const restorePath = path.join(directory, "legacy-restored.sqlite");
      restoreDatabaseBackup(legacyPath + ".awenc", restorePath);
      const restored = new Database(restorePath, { readonly: true });
      try {
        expect(restored.prepare("SELECT value FROM checkpoint_state").get().value).toBe("legacy-backup-value");
      } finally {
        restored.close();
      }
    });
  });

  it("encrypts historical pre-restore copies beside the database during startup migration", () => {
    withTempDirectory((directory) => {
      const legacyPath = path.join(directory, "alphaway.sqlite.pre-restore-old.sqlite");
      const legacyDb = new Database(legacyPath);
      legacyDb.exec("CREATE TABLE checkpoint_state (value TEXT NOT NULL)");
      legacyDb.prepare("INSERT INTO checkpoint_state VALUES (?)").run("pre-restore-value");
      legacyDb.close();

      const encrypted = encryptExistingMigrationBackups(directory, "alphaway.sqlite");
      expect(encrypted).toEqual([legacyPath + ".awenc"]);
      expect(fs.existsSync(legacyPath)).toBe(false);
      expect(isEncryptedSecret(fs.readFileSync(legacyPath + ".awenc", "utf8").trim())).toBe(true);
    });
  });

  it("converts a legacy plaintext backup when it is restored directly", () => {
    withTempDirectory((directory) => {
      const legacyPath = path.join(directory, "legacy-plain.sqlite");
      const legacyDb = new Database(legacyPath);
      legacyDb.exec("CREATE TABLE checkpoint_state (value TEXT NOT NULL)");
      legacyDb.prepare("INSERT INTO checkpoint_state VALUES (?)").run("legacy-plain-value");
      legacyDb.close();

      const restorePath = path.join(directory, "legacy-plain-restored.sqlite");
      restoreDatabaseBackup(legacyPath, restorePath);
      expect(fs.existsSync(legacyPath)).toBe(false);
      expect(isEncryptedSecret(fs.readFileSync(legacyPath + ".awenc", "utf8").trim())).toBe(true);
      const restored = new Database(restorePath, { readonly: true });
      try {
        expect(restored.prepare("SELECT value FROM checkpoint_state").get().value).toBe("legacy-plain-value");
      } finally {
        restored.close();
      }
    });
  });

  it("restores legacy v1 encrypted backup envelopes after the streaming v2 migration", () => {
    withTempDirectory((directory) => {
      const sourcePath = path.join(directory, "v1-source.sqlite");
      const sourceDb = new Database(sourcePath);
      sourceDb.exec("CREATE TABLE checkpoint_state (value TEXT NOT NULL)");
      sourceDb.prepare("INSERT INTO checkpoint_state VALUES (?)").run("legacy-v1-value");
      sourceDb.close();

      const legacyEnvelope = encryptSecret(fs.readFileSync(sourcePath).toString("base64"));
      expect(legacyEnvelope.startsWith("awenc:v1:")).toBe(true);
      const legacyBackup = path.join(directory, "legacy-v1.sqlite.awenc");
      fs.writeFileSync(legacyBackup, legacyEnvelope, { mode: 0o600 });

      const restorePath = path.join(directory, "v1-restored.sqlite");
      restoreDatabaseBackup(legacyBackup, restorePath);
      const restored = new Database(restorePath, { readonly: true });
      try {
        expect(restored.prepare("SELECT value FROM checkpoint_state").get().value).toBe("legacy-v1-value");
      } finally {
        restored.close();
      }
    });
  });

  it("streams large SQLite snapshots to and from encrypted backup files", () => {
    withTempDirectory((directory) => {
      const databasePath = path.join(directory, "large.sqlite");
      const db = new Database(databasePath);
      db.exec("CREATE TABLE large_state (payload BLOB NOT NULL)");
      db.prepare("INSERT INTO large_state VALUES (zeroblob(?))").run(24 * 1024 * 1024);

      const backupPath = createMigrationBackup(db, databasePath, "large-snapshot");
      db.close();

      const fd = fs.openSync(backupPath, "r");
      const prefix = Buffer.alloc(9);
      try {
        expect(fs.readSync(fd, prefix, 0, prefix.length, 0)).toBe(prefix.length);
      } finally {
        fs.closeSync(fd);
      }
      expect(prefix.toString("ascii")).toBe("awenc:v2:");

      restoreDatabaseBackup(backupPath, databasePath);
      const restored = new Database(databasePath, { readonly: true });
      try {
        const row = restored.prepare("SELECT length(payload) AS size FROM large_state").get() as { size: number };
        expect(row.size).toBe(24 * 1024 * 1024);
        const integrity = restored.query("PRAGMA quick_check").get() as Record<string, string>;
        expect(Object.values(integrity)[0]).toBe("ok");
      } finally {
        restored.close();
      }
    });
  });

  it("restores legacy v1 encrypted backup envelopes after the streaming v2 migration", () => {
    withTempDirectory((directory) => {
      const sourcePath = path.join(directory, "v1-source.sqlite");
      const sourceDb = new Database(sourcePath);
      sourceDb.exec("CREATE TABLE checkpoint_state (value TEXT NOT NULL)");
      sourceDb.prepare("INSERT INTO checkpoint_state VALUES (?)").run("legacy-v1-value");
      sourceDb.close();

      const legacyEnvelope = encryptSecret(fs.readFileSync(sourcePath).toString("base64"));
      expect(legacyEnvelope.startsWith("awenc:v1:")).toBe(true);
      const legacyBackup = path.join(directory, "legacy-v1.sqlite.awenc");
      fs.writeFileSync(legacyBackup, legacyEnvelope, { mode: 0o600 });

      const restorePath = path.join(directory, "v1-restored.sqlite");
      restoreDatabaseBackup(legacyBackup, restorePath);
      const restored = new Database(restorePath, { readonly: true });
      try {
        expect(restored.prepare("SELECT value FROM checkpoint_state").get().value).toBe("legacy-v1-value");
      } finally {
        restored.close();
      }
    });
  });

  it("streams large SQLite snapshots to and from encrypted backup files", () => {
    withTempDirectory((directory) => {
      const databasePath = path.join(directory, "large.sqlite");
      const db = new Database(databasePath);
      db.exec("CREATE TABLE large_state (payload BLOB NOT NULL)");
      db.prepare("INSERT INTO large_state VALUES (zeroblob(?))").run(24 * 1024 * 1024);

      const backupPath = createMigrationBackup(db, databasePath, "large-snapshot");
      db.close();

      const fd = fs.openSync(backupPath, "r");
      const prefix = Buffer.alloc(9);
      try {
        expect(fs.readSync(fd, prefix, 0, prefix.length, 0)).toBe(prefix.length);
      } finally {
        fs.closeSync(fd);
      }
      expect(prefix.toString("ascii")).toBe("awenc:v2:");

      restoreDatabaseBackup(backupPath, databasePath);
      const restored = new Database(databasePath, { readonly: true });
      try {
        const row = restored.prepare("SELECT length(payload) AS size FROM large_state").get() as { size: number };
        expect(row.size).toBe(24 * 1024 * 1024);
        const integrity = restored.query("PRAGMA quick_check").get() as Record<string, string>;
        expect(Object.values(integrity)[0]).toBe("ok");
      } finally {
        restored.close();
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
