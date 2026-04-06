"use server";

import { redirect } from "next/navigation";
import { signInWithPassword, signOutCurrentUser } from "@/lib/auth";

export async function signInAction(_: string | undefined, formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await signInWithPassword(username, password);

  if (!result.ok) {
    return result.error;
  }

  redirect("/app");
}

export async function signOutAction() {
  await signOutCurrentUser();
  redirect("/");
}
