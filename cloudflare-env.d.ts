declare interface CloudflareEnv {
  DB: D1Database;
  APP_NAME: string;
  GEMINI_MODEL: string;
  GEMINI_API_KEY?: string;
  GEMINI_KEYS_MASTER_SECRET?: string;
}
