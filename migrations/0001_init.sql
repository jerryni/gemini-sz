CREATE TABLE IF NOT EXISTS "users" (
  "id" text NOT NULL,
  "username" text NOT NULL UNIQUE,
  "display_name" text DEFAULT NULL,
  "password_salt" text NOT NULL,
  "password_hash" text NOT NULL,
  "is_admin" integer NOT NULL DEFAULT 0,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_sessions" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "session_token_hash" text NOT NULL UNIQUE,
  "expires_at" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_app_sessions_user_expires"
ON "app_sessions" ("user_id", "expires_at" DESC);

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_conversations_user_updated_at"
ON "conversations" ("user_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" text NOT NULL,
  "conversation_id" text NOT NULL,
  "role" text NOT NULL CHECK(role IN ('user', 'assistant')),
  "content" text NOT NULL,
  "image_mime_type" text,
  "image_base64" text,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_messages_conversation_created_at"
ON "messages" ("conversation_id", "created_at" ASC);

CREATE TABLE IF NOT EXISTS "gemini_usage_events" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "conversation_id" text NOT NULL,
  "model" text NOT NULL,
  "request_count" integer NOT NULL DEFAULT 1,
  "prompt_tokens" integer NOT NULL DEFAULT 0,
  "candidate_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL CHECK(status IN ('success', 'error')),
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_usage_user_created_at"
ON "gemini_usage_events" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_usage_user_model_created_at"
ON "gemini_usage_events" ("user_id", "model", "created_at" DESC);
