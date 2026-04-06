import { z } from "zod";
import { getRequestEnv } from "@/lib/env";
import type { MessageRecord } from "@/lib/db";

const chatInputSchema = z.object({
  prompt: z.string().min(1).max(5000),
  image: z
    .object({
      mimeType: z.string().min(1).max(100),
      data: z.string().min(1)
    })
    .optional()
});

type ChatInput = z.infer<typeof chatInputSchema>;

const SYSTEM_INSTRUCTION =
  "You are a helpful assistant. Always answer in Simplified Chinese, regardless of the language used by the user. If the user asks for translation or quotes foreign text, keep the source text as needed, but all explanations and surrounding commentary must be in Simplified Chinese.";

function buildHistoryParts(messages: MessageRecord[]) {
  return messages.map((message) => {
    const parts: Array<Record<string, unknown>> = [];

    if (message.imageMimeType && message.imageBase64) {
      parts.push({
        inlineData: {
          mimeType: message.imageMimeType,
          data: message.imageBase64
        }
      });
    }

    parts.push({ text: message.content });

    return {
      role: message.role === "assistant" ? "model" : "user",
      parts
    };
  });
}

export async function runGeminiChat(
  rawInput: unknown,
  history: MessageRecord[],
  options?: { apiKey?: string }
) {
  const input = chatInputSchema.parse(rawInput);
  const env = await getRequestEnv();
  const apiKey = options?.apiKey?.trim() || env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const contents = [...buildHistoryParts(history)];
  const currentParts: Array<Record<string, unknown>> = [];

  if (input.image) {
    currentParts.push({
      inlineData: {
        mimeType: input.image.mimeType,
        data: input.image.data
      }
    });
  }

  currentParts.push({ text: input.prompt });

  contents.push({
    role: "user",
    parts: currentParts
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        generationConfig: {
          temperature: 0.35,
          topP: 0.9
        }
      })
    }
  );

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini request failed.");
  }

  const answer =
    data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("")
      .trim() || "";

  if (!answer) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    answer,
    model: env.GEMINI_MODEL,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      candidateTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata?.totalTokenCount ?? 0
    }
  };
}
