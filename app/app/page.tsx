import { ChatShell } from "@/components/chat-shell";
import { requireUser } from "@/lib/auth";
import { ensureAppSchema, listConversations } from "@/lib/db";
import { getRequestEnv } from "@/lib/env";

export default async function AppPage() {
  const user = await requireUser();

  await ensureAppSchema();
  const conversations = await listConversations(user.id);
  const env = await getRequestEnv();

  return (
    <main className="workspace-page">
      <ChatShell
        configuredGeminiModel={env.GEMINI_MODEL}
        initialConversations={conversations}
        isAdmin={user.isAdmin}
        userLabel={user.displayName ?? user.username}
      />
    </main>
  );
}
