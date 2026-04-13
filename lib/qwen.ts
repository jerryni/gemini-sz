import { z } from "zod";
import { resolveDefaultQwenModel } from "@/lib/chat-models";
import { getRequestEnv } from "@/lib/env";
import type { MessageRecord } from "@/lib/db";

const chatInputSchema = z.object({
  prompt: z.string().max(5000).default(""),
  image: z
    .object({
      mimeType: z.string().min(1).max(100),
      data: z.string().min(1)
    })
    .optional()
});

const SYSTEM_INSTRUCTION =
  "You are a helpful assistant. Always answer in Simplified Chinese, regardless of the language used by the user. If the user asks for translation or quotes foreign text, keep the source text as needed, but all explanations and surrounding commentary must be in Simplified Chinese.";

type QwenMessageContent =
  | string
  | Array<
      | {
          type: "text";
          text: string;
        }
      | {
          type: "image_url";
          image_url: {
            url: string;
          };
        }
    >;

function buildQwenMessageContent(input: {
  content: string;
  imageMimeType?: string | null;
  imageBase64?: string | null;
}): QwenMessageContent {
  if (!input.imageMimeType || !input.imageBase64) {
    return input.content;
  }

  const contentParts: QwenMessageContent = [
    {
      type: "image_url",
      image_url: {
        url: `data:${input.imageMimeType};base64,${input.imageBase64}`
      }
    }
  ];

  if (input.content) {
    contentParts.push({
      type: "text",
      text: input.content
    });
  }

  return contentParts;
}

function buildHistoryMessages(messages: MessageRecord[]) {
  return messages.map((message) => ({
    role: message.role,
    content: buildQwenMessageContent({
      content: message.content,
      imageMimeType: message.imageMimeType,
      imageBase64: message.imageBase64
    })
  }));
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part !== "object" || !part) {
        return "";
      }

      const text = "text" in part ? part.text : "";
      return typeof text === "string" ? text : "";
    })
    .join("")
    .trim();
}

export function resolveQwenApiKey(env: CloudflareEnv) {
  return env.DASHSCOPE_API_KEY?.trim() || env.QWEN_API_KEY?.trim() || "";
}

export function resolveQwenModel(env: CloudflareEnv, hasImage: boolean) {
  return resolveDefaultQwenModel(env, hasImage);
}

export async function runQwenChat(
  rawInput: unknown,
  history: MessageRecord[],
  options?: { apiKey?: string; model?: string }
) {
  const input = chatInputSchema.parse(rawInput);
  const env = await getRequestEnv();
  const apiKey = options?.apiKey?.trim() || resolveQwenApiKey(env);
  const model = options?.model?.trim() || resolveQwenModel(env, Boolean(input.image));
  const baseUrl =
    env.QWEN_BASE_URL?.trim() ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

  if (!apiKey) {
    throw new Error("Missing Qwen API key.");
  }

  const messages = [
    {
      role: "system",
      content: SYSTEM_INSTRUCTION
    },
    ...buildHistoryMessages(history),
    {
      role: "user",
      content: buildQwenMessageContent({
        content: input.prompt,
        imageMimeType: input.image?.mimeType,
        imageBase64: input.image?.data
      })
    }
  ];

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      top_p: 0.9
    })
  });

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    error?: {
      message?: string;
    };
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.error?.message || data.message || "Qwen request failed.");
  }

  const answer = extractTextContent(data.choices?.[0]?.message?.content);

  if (!answer) {
    throw new Error("Qwen returned an empty response.");
  }

  return {
    answer,
    model,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      candidateTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0
    }
  };
}
