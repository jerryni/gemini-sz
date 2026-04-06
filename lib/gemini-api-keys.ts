import { ensureAppSchema } from "@/lib/db";
import { getRequestEnv } from "@/lib/env";
import {
  apiKeyLast4,
  encryptGeminiApiKeyPlaintext
} from "@/lib/crypto-gemini-keys";

export type GeminiKeyPublic = {
  id: string;
  label: string;
  last4: string;
  createdAt: string;
  updatedAt: string;
};

export type UserAssignmentRow = {
  userId: string;
  username: string;
  displayName: string | null;
  geminiKeyId: string | null;
  keyLabel: string | null;
  keyLast4: string | null;
};

export async function loadAdminGeminiKeysPageData() {
  await ensureAppSchema();
  const env = await getRequestEnv();

  const keysResult = await env.DB.prepare(
    `SELECT
      id,
      label,
      last4,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM gemini_api_keys
    ORDER BY created_at DESC`
  ).all<GeminiKeyPublic>();

  const assignResult = await env.DB.prepare(
    `SELECT
      u.id AS userId,
      u.username,
      u.display_name AS displayName,
      a.gemini_key_id AS geminiKeyId,
      k.label AS keyLabel,
      k.last4 AS keyLast4
    FROM users u
    LEFT JOIN gemini_key_assignments a ON a.user_id = u.id
    LEFT JOIN gemini_api_keys k ON k.id = a.gemini_key_id
    ORDER BY u.username ASC`
  ).all<UserAssignmentRow>();

  return {
    keys: keysResult.results ?? [],
    assignments: assignResult.results ?? []
  };
}

async function requireMasterSecret() {
  const env = await getRequestEnv();
  const master = env.GEMINI_KEYS_MASTER_SECRET?.trim();
  if (!master) {
    throw new Error("GEMINI_KEYS_MASTER_SECRET is not configured.");
  }

  return { env, master };
}

export async function adminCreateGeminiKey(label: string, apiKeyPlain: string) {
  await ensureAppSchema();
  const { env, master } = await requireMasterSecret();
  const trimmedLabel = label.replace(/\s+/g, " ").trim().slice(0, 120);
  const trimmedKey = apiKeyPlain.trim();

  if (!trimmedLabel || !trimmedKey) {
    throw new Error("Label and API key are required.");
  }

  const { ciphertextB64, ivB64 } = await encryptGeminiApiKeyPlaintext(
    trimmedKey,
    master
  );
  const id = crypto.randomUUID();
  const last4 = apiKeyLast4(trimmedKey);

  await env.DB.prepare(
    `INSERT INTO gemini_api_keys (id, label, ciphertext_b64, iv_b64, last4)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, trimmedLabel, ciphertextB64, ivB64, last4)
    .run();
}

export async function adminUpdateGeminiKeyLabel(id: string, label: string) {
  await ensureAppSchema();
  const env = await getRequestEnv();
  const trimmedLabel = label.replace(/\s+/g, " ").trim().slice(0, 120);

  if (!trimmedLabel) {
    throw new Error("Label is required.");
  }

  const result = await env.DB.prepare(
    `UPDATE gemini_api_keys
     SET label = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(trimmedLabel, id)
    .run();

  if (!result.meta.changes) {
    throw new Error("Key not found.");
  }
}

export async function adminRotateGeminiKeySecret(id: string, apiKeyPlain: string) {
  await ensureAppSchema();
  const { env, master } = await requireMasterSecret();
  const trimmedKey = apiKeyPlain.trim();

  if (!trimmedKey) {
    throw new Error("API key is required.");
  }

  const { ciphertextB64, ivB64 } = await encryptGeminiApiKeyPlaintext(
    trimmedKey,
    master
  );
  const last4 = apiKeyLast4(trimmedKey);

  const result = await env.DB.prepare(
    `UPDATE gemini_api_keys
     SET ciphertext_b64 = ?,
         iv_b64 = ?,
         last4 = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(ciphertextB64, ivB64, last4, id)
    .run();

  if (!result.meta.changes) {
    throw new Error("Key not found.");
  }
}

export async function adminDeleteGeminiKey(id: string) {
  await ensureAppSchema();
  const env = await getRequestEnv();

  const result = await env.DB.prepare(`DELETE FROM gemini_api_keys WHERE id = ?`)
    .bind(id)
    .run();

  if (!result.meta.changes) {
    throw new Error("Key not found.");
  }
}

export async function adminSetUserGeminiKey(
  userId: string,
  geminiKeyId: string | null
) {
  await ensureAppSchema();
  const env = await getRequestEnv();

  const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ id: string }>();

  if (!user) {
    throw new Error("User not found.");
  }

  if (geminiKeyId) {
    const key = await env.DB.prepare(`SELECT id FROM gemini_api_keys WHERE id = ?`)
      .bind(geminiKeyId)
      .first<{ id: string }>();

    if (!key) {
      throw new Error("Key not found.");
    }

    const existing = await env.DB.prepare(
      `SELECT id FROM gemini_key_assignments WHERE user_id = ?`
    )
      .bind(userId)
      .first<{ id: string }>();

    if (existing) {
      await env.DB.prepare(
        `UPDATE gemini_key_assignments
         SET gemini_key_id = ?, created_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`
      )
        .bind(geminiKeyId, userId)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO gemini_key_assignments (id, user_id, gemini_key_id)
         VALUES (?, ?, ?)`
      )
        .bind(crypto.randomUUID(), userId, geminiKeyId)
        .run();
    }
  } else {
    await env.DB.prepare(`DELETE FROM gemini_key_assignments WHERE user_id = ?`)
      .bind(userId)
      .run();
  }
}
