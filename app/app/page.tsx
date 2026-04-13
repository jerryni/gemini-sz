import { ChatShell } from "@/components/chat-shell";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getChatModelOptions, resolveDefaultChatModel } from "@/lib/chat-models";
import { ensureAppSchema, listConversations } from "@/lib/db";
import { getRequestEnv } from "@/lib/env";

export default async function AppPage() {
  const user = await requireUser();

  await ensureAppSchema();
  const conversations = await listConversations(user.id);
  const env = await getRequestEnv();
  const requestHeaders = await headers();
  const request = new Request("https://app.local", { headers: requestHeaders });
  const defaultModelId = resolveDefaultChatModel({
    request,
    env,
    hasImage: false
  });
  const availableModels = getChatModelOptions(env);

  return (
    <main className="workspace-page">
      <ChatShell
        availableModels={availableModels}
        defaultModelId={defaultModelId}
        initialConversations={conversations}
        isAdmin={user.isAdmin}
        userLabel={user.displayName ?? user.username}
      />
    </main>
  );
}
