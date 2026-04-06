ALTER TABLE "gemini_usage_events" ADD COLUMN "gemini_key_id" text;

CREATE INDEX IF NOT EXISTS "idx_usage_user_key_model_created_at"
ON "gemini_usage_events" ("user_id", "gemini_key_id", "model", "created_at" DESC);
