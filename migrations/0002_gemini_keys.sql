CREATE TABLE IF NOT EXISTS "gemini_api_keys" (
  "id" text NOT NULL,
  "label" text NOT NULL,
  "ciphertext_b64" text NOT NULL,
  "iv_b64" text NOT NULL,
  "last4" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "gemini_key_assignments" (
  "id" text NOT NULL,
  "user_id" text NOT NULL UNIQUE,
  "gemini_key_id" text NOT NULL,
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("gemini_key_id") REFERENCES "gemini_api_keys" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_gemini_key_assignments_key"
ON "gemini_key_assignments" ("gemini_key_id");
