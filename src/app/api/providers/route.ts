import { jsonOk, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { listProviders } from "@/lib/services/providers";

export async function GET(): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    return jsonOk({ providers: await listProviders() });
  });
}
