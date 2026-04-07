import { resolveGeminiModelForRequest } from "@/lib/gemini-models";
import { isHongKongRequest } from "@/lib/request-country";
import { resolveQwenModel } from "@/lib/qwen";

export type ChatProvider = "gemini" | "qwen";

export function resolveChatProvider(request: Request): ChatProvider {
  return isHongKongRequest(request) ? "qwen" : "gemini";
}

export function resolveChatModel(input: {
  request: Request;
  bodyModel?: string;
  env: CloudflareEnv;
  hasImage: boolean;
}) {
  if (resolveChatProvider(input.request) === "qwen") {
    return resolveQwenModel(input.env, input.hasImage);
  }

  return resolveGeminiModelForRequest(input.bodyModel, input.env.GEMINI_MODEL);
}
