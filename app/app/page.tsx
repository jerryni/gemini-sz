import { ChatShell } from "@/components/chat-shell";
import { requireUser } from "@/lib/auth";
import { ensureAppSchema, listConversations } from "@/lib/db";

export default async function AppPage() {
  const user = await requireUser();

  await ensureAppSchema();
  const conversations = await listConversations(user.id);

  return (
    <main className="workspace-page">
      <ChatShell
        initialConversations={conversations}
        userLabel={user.displayName ?? user.username}
      />
    </main>
  );
}
