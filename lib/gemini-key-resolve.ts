import { ensureAppSchema } from "@/lib/db";
import { getRequestEnv } from "@/lib/env";
import { decryptGeminiApiKeyMaterial } from "@/lib/crypto-gemini-keys";

export type ResolvedUserGeminiKey = {
  apiKey: string;
  geminiKeyId: string | null;
  usageLabel: string;
  usageLast4: string | null;
};

export async function resolveGeminiApiKeyForUser(
  userId: string
): Promise<ResolvedUserGeminiKey | null> {
  await ensureAppSchema();
  const env = await getRequestEnv();

  const row = await env.DB.prepare(
    `SELECT
      k.id AS keyId,
      k.label AS keyLabel,
      k.last4 AS keyLast4,
      k.ciphertext_b64 AS ciphertextB64,
      k.iv_b64 AS ivB64
    FROM gemini_key_assignments a
    INNER JOIN gemini_api_keys k ON k.id = a.gemini_key_id
    WHERE a.user_id = ?`
  )
    .bind(userId)
    .first<{
      keyId: string;
      keyLabel: string;
      keyLast4: string;
      ciphertextB64: string;
      ivB64: string;
    }>();

  if (!row) {
    const fallback = env.GEMINI_API_KEY?.trim();
    if (!fallback) {
      return null;
    }

    return {
      apiKey: fallback,
      geminiKeyId: null,
      usageLabel: "Environment (GEMINI_API_KEY)",
      usageLast4: null
    };
  }

  const master = env.GEMINI_KEYS_MASTER_SECRET?.trim();
  if (!master) {
    throw new Error(
      "GEMINI_KEYS_MASTER_SECRET is required to use a per-user Gemini API key."
    );
  }

  const apiKey = await decryptGeminiApiKeyMaterial(
    row.ciphertextB64,
    row.ivB64,
    master
  );

  return {
    apiKey,
    geminiKeyId: row.keyId,
    usageLabel: row.keyLabel,
    usageLast4: row.keyLast4
  };
}
