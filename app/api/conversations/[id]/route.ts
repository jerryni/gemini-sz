import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getConversationMessages, renameConversation } from "@/lib/db";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Params) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const messages = await getConversationMessages(user.id, id);

  if (!messages) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json({ messages });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as { title?: string };
  const title = body.title?.trim();

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const updated = await renameConversation(user.id, id, title);

  if (!updated) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json({ id, title: title.slice(0, 80) });
}
