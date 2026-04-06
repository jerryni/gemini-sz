import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listConversations } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await listConversations(user.id);
  return NextResponse.json({ conversations });
}
