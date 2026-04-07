declare interface CloudflareEnv {
  DB: D1Database;
  APP_NAME: string;
  GEMINI_MODEL: string;
  GEMINI_API_KEY?: string;
  GEMINI_KEYS_MASTER_SECRET?: string;
  DASHSCOPE_API_KEY?: string;
  QWEN_API_KEY?: string;
  QWEN_BASE_URL?: string;
  QWEN_MODEL?: string;
  QWEN_TEXT_MODEL?: string;
  QWEN_IMAGE_MODEL?: string;
}
