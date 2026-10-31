import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { deleteAgentMemory, updateAgentMemory } from "@/lib/services/memory";
import { agentMemoryUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const { id } = await context.params;
    const input = agentMemoryUpdateSchema.parse(await readJson(request));
    const memory = await updateAgentMemory(id, input, session.id);
    return jsonOk({ memory });
  });
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const { id } = await context.params;
    await deleteAgentMemory(id, session.id);
    return jsonOk({ ok: true });
  });
}
