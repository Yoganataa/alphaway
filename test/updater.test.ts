import { describe, expect, it } from "bun:test";
import { checkAndApplyUpdate, repairMissingModules } from "../src/core/updater";

describe("safe update behavior", () => {
  it("does not perform the obsolete file-by-file self-update", async () => {
    const original = process.env.AUTO_UPDATE;
    process.env.AUTO_UPDATE = "force";
    try {
      await expect(checkAndApplyUpdate()).resolves.toEqual({
        updated: false,
        reason: "manual-install-required",
      });
    } finally {
      if (original === undefined) delete process.env.AUTO_UPDATE;
      else process.env.AUTO_UPDATE = original;
    }
  });

  it("does not download missing modules from the obsolete server.js layout", async () => {
    await expect(repairMissingModules()).resolves.toEqual({
      repaired: [],
      failed: [],
    });
  });
});
