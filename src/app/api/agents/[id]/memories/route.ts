import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { createAgentMemory, listAgentMemories } from "@/lib/services/memory";
import { agentMemoryCreateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    const { id } = await context.params;
    return jsonOk({ memories: await listAgentMemories(id) });
  });
}

export async function POST(request: Request, context: Context): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const { id } = await context.params;
    const input = agentMemoryCreateSchema.parse(await readJson(request));
    const memory = await createAgentMemory(id, input, session.id);
    return jsonOk({ memory }, 201);
  });
}
