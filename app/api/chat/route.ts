import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  appendMessage,
  createConversation,
  getConversationMessages,
  recordUsageEvent,
  type MessageRecord
} from "@/lib/db";
import { getRequestEnv } from "@/lib/env";
import { resolveGeminiApiKeyForUser } from "@/lib/gemini-key-resolve";
import { runGeminiChat } from "@/lib/gemini";
import { resolveGeminiModelForRequest } from "@/lib/gemini-models";

type ChatRequest = {
  conversationId?: string;
  prompt?: string;
  model?: string;
  image?: {
    mimeType: string;
    data: string;
  };
};

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ChatRequest;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  let conversationId: string;
  let history: MessageRecord[] = [];

  if (body.conversationId?.trim()) {
    conversationId = body.conversationId.trim();
    const existingHistory = await getConversationMessages(user.id, conversationId);

    if (!existingHistory) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    history = existingHistory;
  } else {
    conversationId = await createConversation(user.id, prompt, prompt);
  }

  await appendMessage({
    conversationId,
    role: "user",
    content: prompt,
    imageMimeType: body.image?.mimeType ?? null,
    imageBase64: body.image?.data ?? null
  });

  const env = await getRequestEnv();

  let resolvedModel: string;
  try {
    resolvedModel = resolveGeminiModelForRequest(body.model, env.GEMINI_MODEL);
  } catch {
    return NextResponse.json({ error: "Unsupported model." }, { status: 400 });
  }

  let apiKey: string;
  let usageGeminiKeyId: string | null;
  try {
    const resolved = await resolveGeminiApiKeyForUser(user.id);
    if (!resolved) {
      return NextResponse.json(
        {
          error:
            "No Gemini API key is available. Ask an admin to assign a key, or set GEMINI_API_KEY."
        },
        { status: 403 }
      );
    }
    apiKey = resolved.apiKey;
    usageGeminiKeyId = resolved.geminiKeyId;
  } catch (resolveError) {
    return NextResponse.json(
      {
        error:
          resolveError instanceof Error
            ? resolveError.message
            : "Failed to resolve Gemini API key."
      },
      { status: 500 }
    );
  }

  try {
    const result = await runGeminiChat(
      {
        prompt,
        image: body.image
      },
      history,
      { apiKey, model: body.model }
    );

    await appendMessage({
      conversationId,
      role: "assistant",
      content: result.answer
    });

    try {
      await recordUsageEvent({
        userId: user.id,
        conversationId,
        model: result.model,
        geminiKeyId: usageGeminiKeyId,
        promptTokens: result.usage.promptTokens,
        candidateTokens: result.usage.candidateTokens,
        totalTokens: result.usage.totalTokens,
        status: "success"
      });
    } catch (usageError) {
      console.error("Failed to record Gemini usage event.", usageError);
    }

    return NextResponse.json({
      conversationId,
      message: result.answer,
      model: result.model
    });
  } catch (error) {
    try {
      await recordUsageEvent({
        userId: user.id,
        conversationId,
        model: resolvedModel,
        geminiKeyId: usageGeminiKeyId,
        status: "error"
      });
    } catch (usageError) {
      console.error("Failed to record Gemini usage event.", usageError);
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Gemini request failed."
      },
      { status: 500 }
    );
  }
}
