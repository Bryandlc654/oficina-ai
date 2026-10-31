import { jsonOk, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { listAgents } from "@/lib/services/agents";

export async function GET(): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    return jsonOk({ agents: await listAgents() });
  });
}
