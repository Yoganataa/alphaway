/**
 * AlphaWay update compatibility shim.
 *
 * The former self-updater fetched root-level JavaScript files from the legacy
 * server.js layout. That layout no longer exists: AlphaWay is now a TypeScript
 * source tree built into a Bun executable. Downloading individual legacy files
 * could not update this application safely.
 *
 * Updates are therefore performed by install.sh from a complete repository
 * snapshot. This module intentionally performs no network or filesystem writes.
 */

export const AUTO_UPDATE = false;
export const VERSION = "0.0.1";
export const UPDATE_CHECK_TTL_MS = 0;

export function __setLastUpdateCheck(_time: number): void {
  // Kept temporarily for callers/tests migrating from the legacy updater.
}

export function __getLastUpdateCheck(): number {
  return 0;
}

export async function repairMissingModules(): Promise<{ repaired: string[]; failed: string[] }> {
  return { repaired: [], failed: [] };
}

export async function checkAndApplyUpdate(): Promise<{
  updated: false;
  reason: "manual-install-required";
}> {
  return { updated: false, reason: "manual-install-required" };
}
