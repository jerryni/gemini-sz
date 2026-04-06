import { cache } from "react";
import { getRequestEnv } from "@/lib/env";

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  lastAssistantMessage: string | null;
};

export type MessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageMimeType: string | null;
  imageBase64: string | null;
  createdAt: string;
};

export const ensureAppSchema = cache(async () => {
  const env = await getRequestEnv();
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS app_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_app_sessions_user_expires
      ON app_sessions (user_id, expires_at DESC)`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_user_updated_at
      ON conversations (user_id, updated_at DESC)`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      image_mime_type TEXT,
      image_base64 TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
      ON messages (conversation_id, created_at ASC)`
  ];

  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
});

export async function listConversations(userId: string) {
  await ensureAppSchema();
  const env = await getRequestEnv();
  const result = await env.DB.prepare(
    `SELECT
      c.id,
      c.title,
      c.updated_at AS updatedAt,
      (
        SELECT m.content
        FROM messages m
        WHERE m.conversation_id = c.id AND m.role = 'assistant'
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS lastAssistantMessage
    FROM conversations c
    WHERE c.user_id = ?
    ORDER BY c.updated_at DESC`
  )
    .bind(userId)
    .all<ConversationSummary>();

  return result.results ?? [];
}

export async function getConversationMessages(
  userId: string,
  conversationId: string
) {
  await ensureAppSchema();
  const env = await getRequestEnv();

  const ownership = await env.DB.prepare(
    `SELECT id FROM conversations WHERE id = ? AND user_id = ?`
  )
    .bind(conversationId, userId)
    .first<{ id: string }>();

  if (!ownership) {
    return null;
  }

  const result = await env.DB.prepare(
    `SELECT
      id,
      role,
      content,
      image_mime_type AS imageMimeType,
      image_base64 AS imageBase64,
      created_at AS createdAt
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC`
  )
    .bind(conversationId)
    .all<MessageRecord>();

  return result.results ?? [];
}

export async function renameConversation(
  userId: string,
  conversationId: string,
  title: string
) {
  await ensureAppSchema();
  const env = await getRequestEnv();
  const normalizedTitle = title.replace(/\s+/g, " ").trim().slice(0, 80);

  if (!normalizedTitle) {
    return false;
  }

  const result = await env.DB.prepare(
    `UPDATE conversations
     SET title = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  )
    .bind(normalizedTitle, conversationId, userId)
    .run();

  return Boolean(result.meta.changes);
}

export async function createConversation(
  userId: string,
  title: string,
  firstMessage: string
) {
  await ensureAppSchema();
  const env = await getRequestEnv();
  const id = crypto.randomUUID();
  const normalizedTitle = title.trim().slice(0, 80) || firstMessage.slice(0, 40);

  await env.DB.prepare(
    `INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)`
  )
    .bind(id, userId, normalizedTitle)
    .run();

  return id;
}

export async function appendMessage(input: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  imageMimeType?: string | null;
  imageBase64?: string | null;
}) {
  await ensureAppSchema();
  const env = await getRequestEnv();
  const id = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO messages (
        id,
        conversation_id,
        role,
        content,
        image_mime_type,
        image_base64
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      input.conversationId,
      input.role,
      input.content,
      input.imageMimeType ?? null,
      input.imageBase64 ?? null
    ),
    env.DB.prepare(
      `UPDATE conversations
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(input.conversationId)
  ]);

  return id;
}
