import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUsageSummary } from "@/lib/db";
import { getRequestEnv } from "@/lib/env";
import { resolveGeminiApiKeyForUser } from "@/lib/gemini-key-resolve";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = await getRequestEnv();

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

  const summary = await getUsageSummary(user.id, env.GEMINI_MODEL, {
    geminiKeyId: resolved.geminiKeyId,
    apiKeyLabel: resolved.usageLabel,
    apiKeyLast4: resolved.usageLast4
  });

  return NextResponse.json(summary);
}
