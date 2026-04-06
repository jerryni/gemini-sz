import { requireAdmin } from "@/lib/auth";
import { ensureAppSchema } from "@/lib/db";
import { AdminGeminiKeysPanel } from "@/components/admin-gemini-keys-panel";
import { loadAdminGeminiKeysPageData } from "@/lib/gemini-api-keys";

export default async function AdminGeminiKeysPage() {
  await requireAdmin();
  await ensureAppSchema();
  const data = await loadAdminGeminiKeysPageData();

  return (
    <main className="workspace-page">
      <AdminGeminiKeysPanel assignments={data.assignments} keys={data.keys} />
    </main>
  );
}
