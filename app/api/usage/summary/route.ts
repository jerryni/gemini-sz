import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveChatModel, resolveChatProvider } from "@/lib/chat-provider";
import { getUsageSummary } from "@/lib/db";
import { getRequestEnv } from "@/lib/env";
import { resolveGeminiApiKeyForUser } from "@/lib/gemini-key-resolve";
import { resolveQwenApiKey } from "@/lib/qwen";

function getKeyLast4(apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.length < 4) {
    return null;
  }

  return trimmed.slice(-4);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = await getRequestEnv();
  const provider = resolveChatProvider(request);
  const modelParam = new URL(request.url).searchParams.get("model") ?? undefined;

  let summaryModel: string;
  try {
    summaryModel = resolveChatModel({
      request,
      bodyModel: modelParam,
      env,
      hasImage: false
    });
  } catch {
    return NextResponse.json({ error: "Unsupported model." }, { status: 400 });
  }

  let keyContext;
  if (provider === "qwen") {
    const apiKey = resolveQwenApiKey(env);
    if (!apiKey) {
      return NextResponse.json(
        { error: "No Qwen API key is configured for this deployment." },
        { status: 403 }
      );
    }

    keyContext = {
      geminiKeyId: null,
      apiKeyLabel: "Qwen (env)",
      apiKeyLast4: getKeyLast4(apiKey)
    };
  } else {
    let resolved;
    try {
      resolved = await resolveGeminiApiKeyForUser(user.id);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to resolve API key context."
        },
        { status: 500 }
      );
    }

    if (!resolved) {
      return NextResponse.json(
        { error: "No Gemini API key is configured for your account." },
        { status: 403 }
      );
    }

    keyContext = {
      geminiKeyId: resolved.geminiKeyId,
      apiKeyLabel: resolved.usageLabel,
      apiKeyLast4: resolved.usageLast4
    };
  }

  const summary = await getUsageSummary(user.id, summaryModel, keyContext);

  return NextResponse.json(summary);
}
