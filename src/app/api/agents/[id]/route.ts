import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { getAgentDetail, updateAgent } from "@/lib/services/agents";
import { agentUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    const { id } = await context.params;
    return jsonOk({ agent: await getAgentDetail(id) });
  });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const { id } = await context.params;
    const input = agentUpdateSchema.parse(await readJson(request));
    const agent = await updateAgent(id, input, session.id);
    return jsonOk({ agent });
  });
}
