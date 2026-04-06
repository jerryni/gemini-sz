import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUsageSummary } from "@/lib/db";
import { getRequestEnv } from "@/lib/env";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = await getRequestEnv();
  const summary = await getUsageSummary(user.id, env.GEMINI_MODEL);

  return NextResponse.json(summary);
}
