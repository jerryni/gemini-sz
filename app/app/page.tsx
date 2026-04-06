import { signOutAction } from "@/components/auth-actions";
import { ChatShell } from "@/components/chat-shell";
import { requireUser } from "@/lib/auth";
import { ensureAppSchema, listConversations } from "@/lib/db";

export default async function AppPage() {
  const user = await requireUser();

  await ensureAppSchema();
  const conversations = await listConversations(user.id);

  return (
    <main className="workspace-page">
      <header className="workspace-bar">
        <div>
          <p className="eyebrow">Signed in as</p>
          <strong>{user.displayName ?? user.username}</strong>
        </div>
        <form action={signOutAction}>
          <button className="ghost-button" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <ChatShell initialConversations={conversations} />
    </main>
  );
}
