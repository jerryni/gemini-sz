import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getRequestEnv() {
  const { env } = await getCloudflareContext({ async: true });
  return env as CloudflareEnv;
}
