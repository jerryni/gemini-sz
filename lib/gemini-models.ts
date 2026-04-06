export const GEMINI_MODEL_PRESETS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite (preview)" }
] as const;

const PRESET_ID_SET = new Set<string>(GEMINI_MODEL_PRESETS.map((entry) => entry.id));

export function mergeGeminiModelOptions(configuredModelId: string) {
  const trimmed = configuredModelId.trim();
  const base = GEMINI_MODEL_PRESETS.map((entry) => ({ id: entry.id, label: entry.label }));

  if (!trimmed || PRESET_ID_SET.has(trimmed)) {
    return base;
  }

  return [{ id: trimmed, label: trimmed }, ...base];
}

export function resolveGeminiModelForRequest(
  bodyModel: string | undefined,
  envModel: string
): string {
  const trimmed = bodyModel?.trim();
  if (!trimmed) {
    return envModel.trim();
  }
  if (trimmed === envModel.trim()) {
    return trimmed;
  }
  if (PRESET_ID_SET.has(trimmed)) {
    return trimmed;
  }
  throw new Error("Unsupported model.");
}
