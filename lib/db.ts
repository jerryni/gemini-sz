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

export type UsageRecordInput = {
  userId: string;
  conversationId: string;
  model: string;
  geminiKeyId?: string | null;
  requestCount?: number;
  promptTokens?: number;
  candidateTokens?: number;
  totalTokens?: number;
  status: "success" | "error";
};

/** D1 max string/blob ~2MB; stay under to avoid SQLITE_TOOBIG */
const D1_MAX_TEXT_BYTES = 1_900_000;

const utf8ByteLength = (value: string) => new TextEncoder().encode(value).length;

const truncateUtf8 = (value: string, maxBytes: number, suffix: string) => {
  if (utf8ByteLength(value) <= maxBytes) {
    return value;
  }
  const encoder = new TextEncoder();
  const suffixBytes = encoder.encode(suffix).length;
  const budget = Math.max(0, maxBytes - suffixBytes);
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (utf8ByteLength(value.slice(0, mid)) <= budget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return `${value.slice(0, lo)}${suffix}`;
};

function clampMessageForD1(input: {
  content: string;
  imageMimeType?: string | null;
  imageBase64?: string | null;
}) {
  const content = truncateUtf8(
    input.content,
    D1_MAX_TEXT_BYTES,
    "\n…[内容已截断以符合数据库单字段大小限制]"
  );
  let imageMimeType = input.imageMimeType ?? null;
  let imageBase64 = input.imageBase64 ?? null;
  if (imageBase64 && utf8ByteLength(imageBase64) > D1_MAX_TEXT_BYTES) {
    imageBase64 = null;
    imageMimeType = null;
  }
  return { content, imageMimeType, imageBase64 };
}

export type UsageSummary = {
  model: string;
  apiKeyLabel: string;
  apiKeyLast4: string | null;
  todayRequests: number;
  todayTokens: number;
  minuteRequests: number;
  minuteTokens: number;
  requestLimit: number;
  minuteRequestLimit: number;
  minuteTokenLimit: number;
  dayResetLabel: string;
  trackedOnly: boolean;
};

type UsageAggregateRow = {
  requestCount: number | null;
  totalTokens: number | null;
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
      is_admin INTEGER NOT NULL DEFAULT 0,
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
      ON messages (conversation_id, created_at ASC)`,
    `CREATE TABLE IF NOT EXISTS gemini_usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      model TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      candidate_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('success', 'error')),
      gemini_key_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_usage_user_created_at
      ON gemini_usage_events (user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_usage_user_model_created_at
      ON gemini_usage_events (user_id, model, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_usage_user_key_model_created_at
      ON gemini_usage_events (user_id, gemini_key_id, model, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS gemini_api_keys (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      ciphertext_b64 TEXT NOT NULL,
      iv_b64 TEXT NOT NULL,
      last4 TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS gemini_key_assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      gemini_key_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (gemini_key_id) REFERENCES gemini_api_keys(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_gemini_key_assignments_key
      ON gemini_key_assignments (gemini_key_id)`
  ];

  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));

  try {
    await env.DB.prepare(
      `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`
    ).run();
  } catch {
    /* column already present */
  }

  try {
    await env.DB.prepare(
      `ALTER TABLE gemini_usage_events ADD COLUMN gemini_key_id TEXT`
    ).run();
  } catch {
    /* column already present */
  }
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

export async function deleteConversation(userId: string, conversationId: string) {
  await ensureAppSchema();
  const env = await getRequestEnv();

  const result = await env.DB.prepare(
    `DELETE FROM conversations
     WHERE id = ? AND user_id = ?`
  )
    .bind(conversationId, userId)
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
  const stored = clampMessageForD1({
    content: input.content,
    imageMimeType: input.imageMimeType,
    imageBase64: input.imageBase64
  });

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
      stored.content,
      stored.imageMimeType,
      stored.imageBase64
    ),
    env.DB.prepare(
      `UPDATE conversations
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(input.conversationId)
  ]);

  return id;
}

export async function recordUsageEvent(input: UsageRecordInput) {
  await ensureAppSchema();
  const env = await getRequestEnv();

  await env.DB.prepare(
    `INSERT INTO gemini_usage_events (
      id,
      user_id,
      conversation_id,
      model,
      request_count,
      prompt_tokens,
      candidate_tokens,
      total_tokens,
      status,
      gemini_key_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.conversationId,
      input.model,
      input.requestCount ?? 1,
      input.promptTokens ?? 0,
      input.candidateTokens ?? 0,
      input.totalTokens ?? 0,
      input.status,
      input.geminiKeyId ?? null
    )
    .run();
}

function getUsageLimits(model: string) {
  if (model === "gemini-2.5-flash") {
    return {
      requestLimit: 20,
      minuteRequestLimit: 5,
      minuteTokenLimit: 250_000
    };
  }

  if (model === "gemini-3.1-flash-lite-preview") {
    return {
      requestLimit: 500,
      minuteRequestLimit: 15,
      minuteTokenLimit: 250_000
    };
  }

  return {
    requestLimit: 100,
    minuteRequestLimit: 5,
    minuteTokenLimit: 100_000
  };
}

function getPacificParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);

  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value ?? "0");

  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute")
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset"
  })
    .formatToParts(date)
    .find((entry) => entry.type === "timeZoneName")?.value;

  const match = offsetPart?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function pacificLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
) {
  const timeZone = "America/Los_Angeles";
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let index = 0; index < 2; index += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMillis), timeZone);
    utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMinutes * 60_000;
  }

  return new Date(utcMillis);
}

function formatPacificResetLabel(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    month: "short",
    day: "numeric"
  });

  const pacific = getPacificParts(now);
  const nextReset = pacificLocalToUtc(pacific.year, pacific.month, pacific.day + 1, 0, 0);

  return formatter.format(nextReset);
}

function getPacificWindowRanges(now = new Date()) {
  const pacific = getPacificParts(now);

  const dayStart = pacificLocalToUtc(pacific.year, pacific.month, pacific.day, 0, 0);
  const nextDayStart = pacificLocalToUtc(pacific.year, pacific.month, pacific.day + 1, 0, 0);
  const minuteStart = pacificLocalToUtc(
    pacific.year,
    pacific.month,
    pacific.day,
    pacific.hour,
    pacific.minute
  );
  const nextMinuteStart = new Date(minuteStart.getTime() + 60 * 1000);

  return {
    dayStartIso: dayStart.toISOString().slice(0, 19).replace("T", " "),
    nextDayStartIso: nextDayStart.toISOString().slice(0, 19).replace("T", " "),
    minuteStartIso: minuteStart.toISOString().slice(0, 19).replace("T", " "),
    nextMinuteStartIso: nextMinuteStart.toISOString().slice(0, 19).replace("T", " ")
  };
}

async function getUsageAggregate(
  userId: string,
  modelIds: string[],
  geminiKeyId: string | null,
  start: string,
  end: string
) {
  const env = await getRequestEnv();
  const placeholders = modelIds.map(() => "?").join(", ");

  const row = await env.DB.prepare(
    `SELECT
      COALESCE(SUM(request_count), 0) AS requestCount,
      COALESCE(SUM(total_tokens), 0) AS totalTokens
    FROM gemini_usage_events
    WHERE user_id = ?
      AND model IN (${placeholders})
      AND created_at >= ?
      AND created_at < ?
      AND COALESCE(gemini_key_id, '') = COALESCE(?, '')`
  )
    .bind(userId, ...modelIds, start, end, geminiKeyId)
    .first<UsageAggregateRow>();

  return {
    requestCount: Number(row?.requestCount ?? 0),
    totalTokens: Number(row?.totalTokens ?? 0)
  };
}

export type UsageSummaryKeyContext = {
  geminiKeyId: string | null;
  apiKeyLabel: string;
  apiKeyLast4: string | null;
};

export async function getUsageSummary(
  userId: string,
  model: string,
  modelIds: string[],
  keyContext: UsageSummaryKeyContext
): Promise<UsageSummary> {
  await ensureAppSchema();

  const { dayStartIso, nextDayStartIso, minuteStartIso, nextMinuteStartIso } =
    getPacificWindowRanges();

  const [today, minute] = await Promise.all([
    getUsageAggregate(
      userId,
      modelIds,
      keyContext.geminiKeyId,
      dayStartIso,
      nextDayStartIso
    ),
    getUsageAggregate(
      userId,
      modelIds,
      keyContext.geminiKeyId,
      minuteStartIso,
      nextMinuteStartIso
    )
  ]);

  const limits = getUsageLimits(model);

  return {
    model,
    apiKeyLabel: keyContext.apiKeyLabel,
    apiKeyLast4: keyContext.apiKeyLast4,
    todayRequests: today.requestCount,
    todayTokens: today.totalTokens,
    minuteRequests: minute.requestCount,
    minuteTokens: minute.totalTokens,
    requestLimit: limits.requestLimit,
    minuteRequestLimit: limits.minuteRequestLimit,
    minuteTokenLimit: limits.minuteTokenLimit,
    dayResetLabel: formatPacificResetLabel(),
    trackedOnly: true
  };
}
