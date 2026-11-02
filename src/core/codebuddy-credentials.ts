import { dbDeleteSetting, dbGetSetting, dbSetSetting } from "./database";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "./secrets";

const SETTING_KEY = "codebuddy_api_key";

/** Environment configuration remains a supported override for existing deployments. */
export function getCodeBuddyApiKey(): string {
  const configured = String(process.env.CODEBUDDY_API_KEY || "").trim();
  if (configured) return configured;

  const stored = dbGetSetting<string>(SETTING_KEY, "");
  if (!stored) return "";
  if (isEncryptedSecret(stored)) return decryptSecret(stored);

  // One-time migration for values written by older builds or external tooling.
  dbSetSetting(SETTING_KEY, encryptSecret(stored));
  return stored;
}

/** Persist an OAuth-issued provider token without writing it to a plaintext .env file. */
export function setCodeBuddyApiKey(value: string): void {
  const secret = String(value || "").trim();
  if (!secret) {
    dbDeleteSetting(SETTING_KEY);
    return;
  }
  dbSetSetting(SETTING_KEY, encryptSecret(secret));
}
