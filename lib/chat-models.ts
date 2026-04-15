import { isHongKongRequest } from "@/lib/request-country";

export type ChatProvider = "gemini" | "qwen";

export type ChatModelOption = {
  id: string;
  label: string;
  provider: ChatProvider;
};

export type UsageModelSelection = {
  model: string;
  modelIds: string[];
  provider: ChatProvider;
};

export const DEFAULT_CHAT_MODEL_ID = "gemini-3.1-flash-lite-preview";

const GEMINI_MODEL_PRESETS: ChatModelOption[] = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite (preview)",
    provider: "gemini"
  }
];

const QWEN_MODEL_PRESETS: ChatModelOption[] = [{ id: "qwen", label: "Qwen", provider: "qwen" }];

const CHAT_MODEL_PRESETS = [...GEMINI_MODEL_PRESETS, ...QWEN_MODEL_PRESETS];
const PRESET_BY_ID = new Map(CHAT_MODEL_PRESETS.map((entry) => [entry.id, entry]));

function trimModelId(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function dedupeModelOptions(options: ChatModelOption[]) {
  const seen = new Set<string>();

  return options.filter((option) => {
    if (seen.has(option.id)) {
      return false;
    }

    seen.add(option.id);
    return true;
  });
}

function getConfiguredQwenModelIds(env: CloudflareEnv) {
  return [
    trimModelId(env.QWEN_MODEL),
    trimModelId(env.QWEN_TEXT_MODEL),
    trimModelId(env.QWEN_IMAGE_MODEL)
  ].filter((value): value is string => Boolean(value));
}

function getQwenRuntimeModelIds(env: CloudflareEnv) {
  return dedupeModelIds([
    resolveDefaultQwenModel(env, false),
    resolveDefaultQwenModel(env, true),
    ...getConfiguredQwenModelIds(env)
  ]);
}

function dedupeModelIds(modelIds: string[]) {
  return Array.from(new Set(modelIds));
}

function getConfiguredModelOptions(env: CloudflareEnv) {
  const configuredIds = [
    { id: trimModelId(env.GEMINI_MODEL), provider: "gemini" as const },
    { id: getConfiguredQwenModelIds(env).length > 0 ? "qwen" : null, provider: "qwen" as const }
  ];

  return configuredIds.flatMap(({ id, provider }) => {
    if (!id) {
      return [];
    }

    const preset = PRESET_BY_ID.get(id);
    if (preset) {
      return [preset];
    }

    return [{ id, label: id, provider }];
  });
}

function inferProviderFromModelId(
  modelId: string | undefined,
  env: CloudflareEnv
): ChatProvider | null {
  const trimmed = trimModelId(modelId);

  if (!trimmed) {
    return null;
  }

  const preset = PRESET_BY_ID.get(trimmed);
  if (preset) {
    return preset.provider;
  }

  if (trimmed === trimModelId(env.GEMINI_MODEL)) {
    return "gemini";
  }

  if (getConfiguredQwenModelIds(env).includes(trimmed)) {
    return "qwen";
  }

  if (trimmed === "qwen") {
    return "qwen";
  }

  if (trimmed.startsWith("gemini")) {
    return "gemini";
  }

  if (trimmed.startsWith("qwen")) {
    return "qwen";
  }

  return null;
}

export function getChatModelOptions(env: CloudflareEnv) {
  return dedupeModelOptions([...getConfiguredModelOptions(env), ...CHAT_MODEL_PRESETS]);
}

export function resolveDefaultQwenModel(env: CloudflareEnv, hasImage: boolean) {
  if (hasImage) {
    return trimModelId(env.QWEN_IMAGE_MODEL) || trimModelId(env.QWEN_MODEL) || "qwen-vl-plus";
  }

  return trimModelId(env.QWEN_TEXT_MODEL) || trimModelId(env.QWEN_MODEL) || "qwen-plus";
}

export function resolveQwenModelForRequest(
  bodyModel: string | undefined,
  env: CloudflareEnv,
  hasImage: boolean
) {
  const trimmed = trimModelId(bodyModel);

  if (!trimmed || trimmed === "qwen") {
    return resolveDefaultQwenModel(env, hasImage);
  }

  const provider = inferProviderFromModelId(trimmed, env);
  if (provider === "qwen") {
    return trimmed;
  }

  throw new Error("Unsupported model.");
}

export function resolveGeminiModelForRequest(
  bodyModel: string | undefined,
  envModel: string
): string {
  const trimmed = trimModelId(bodyModel);
  const configured = trimModelId(envModel);

  if (!configured) {
    throw new Error("Missing Gemini model configuration.");
  }

  if (!trimmed) {
    return configured;
  }

  if (trimmed === configured) {
    return trimmed;
  }

  const preset = PRESET_BY_ID.get(trimmed);
  if (preset?.provider === "gemini") {
    return trimmed;
  }

  throw new Error("Unsupported model.");
}

export function resolveChatProvider(input: {
  request: Request;
  bodyModel?: string;
  env: CloudflareEnv;
}): ChatProvider {
  return inferProviderFromModelId(input.bodyModel, input.env) ??
    (isHongKongRequest(input.request) ? "qwen" : "gemini");
}

export function resolveChatModel(input: {
  request: Request;
  bodyModel?: string;
  env: CloudflareEnv;
  hasImage: boolean;
}) {
  const provider = resolveChatProvider(input);

  if (provider === "qwen") {
    return resolveQwenModelForRequest(input.bodyModel, input.env, input.hasImage);
  }

  return resolveGeminiModelForRequest(input.bodyModel, input.env.GEMINI_MODEL);
}

export function resolveDefaultChatModel(input: {
  request: Request;
  env: CloudflareEnv;
  hasImage: boolean;
}) {
  if (getChatModelOptions(input.env).some((option) => option.id === DEFAULT_CHAT_MODEL_ID)) {
    return DEFAULT_CHAT_MODEL_ID;
  }

  const configuredGeminiModel = trimModelId(input.env.GEMINI_MODEL);
  if (configuredGeminiModel) {
    return configuredGeminiModel;
  }

  return getChatModelOptions(input.env)[0]?.id ?? DEFAULT_CHAT_MODEL_ID;
}

export function resolveUsageModelSelection(input: {
  request: Request;
  bodyModel?: string;
  env: CloudflareEnv;
}): UsageModelSelection {
  const provider = resolveChatProvider(input);
  const trimmed = trimModelId(input.bodyModel);

  if (provider === "qwen") {
    if (!trimmed || trimmed === "qwen") {
      return {
        model: "Qwen (auto: text/image)",
        modelIds: getQwenRuntimeModelIds(input.env),
        provider
      };
    }

    return {
      model: trimmed,
      modelIds: [resolveQwenModelForRequest(trimmed, input.env, trimmed.includes("vl"))],
      provider
    };
  }

  const model = resolveGeminiModelForRequest(trimmed ?? undefined, input.env.GEMINI_MODEL);
  return {
    model,
    modelIds: [model],
    provider
  };
}
