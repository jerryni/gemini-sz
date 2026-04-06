"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  adminCreateGeminiKey,
  adminDeleteGeminiKey,
  adminRotateGeminiKeySecret,
  adminSetUserGeminiKey,
  adminUpdateGeminiKeyLabel
} from "@/lib/gemini-api-keys";

export type GeminiKeyActionState = { ok: boolean; error?: string };

export async function createGeminiKeyFormAction(
  _: GeminiKeyActionState | undefined,
  formData: FormData
): Promise<GeminiKeyActionState> {
  await requireAdmin();
  const label = String(formData.get("label") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "");

  try {
    await adminCreateGeminiKey(label, apiKey);
    revalidatePath("/app/admin/gemini-keys");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create key."
    };
  }
}

export async function updateGeminiKeyLabelFormAction(
  _: GeminiKeyActionState | undefined,
  formData: FormData
): Promise<GeminiKeyActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "");

  try {
    await adminUpdateGeminiKeyLabel(id, label);
    revalidatePath("/app/admin/gemini-keys");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update label."
    };
  }
}

export async function rotateGeminiKeyFormAction(
  _: GeminiKeyActionState | undefined,
  formData: FormData
): Promise<GeminiKeyActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "");

  try {
    await adminRotateGeminiKeySecret(id, apiKey);
    revalidatePath("/app/admin/gemini-keys");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to rotate key."
    };
  }
}

export async function deleteGeminiKeyAction(id: string): Promise<GeminiKeyActionState> {
  await requireAdmin();

  try {
    await adminDeleteGeminiKey(id);
    revalidatePath("/app/admin/gemini-keys");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to delete key."
    };
  }
}

export async function setUserGeminiAssignmentAction(
  userId: string,
  geminiKeyId: string | null
): Promise<GeminiKeyActionState> {
  await requireAdmin();

  try {
    await adminSetUserGeminiKey(userId, geminiKeyId);
    revalidatePath("/app/admin/gemini-keys");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to update assignment."
    };
  }
}
