import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  appendMessage,
  createConversation,
  getConversationMessages,
  type MessageRecord
} from "@/lib/db";
import { runGeminiChat } from "@/lib/gemini";

type ChatRequest = {
  conversationId?: string;
  prompt?: string;
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

  try {
    const result = await runGeminiChat(
      {
        prompt,
        image: body.image
      },
      history
    );

    await appendMessage({
      conversationId,
      role: "assistant",
      content: result.answer
    });

    return NextResponse.json({
      conversationId,
      message: result.answer,
      model: result.model
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Gemini request failed."
      },
      { status: 500 }
    );
  }
}
