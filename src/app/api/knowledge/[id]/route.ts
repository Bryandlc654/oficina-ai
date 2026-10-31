import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { deleteKnowledge, updateKnowledge } from "@/lib/services/memory";
import { knowledgeUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const { id } = await context.params;
    const input = knowledgeUpdateSchema.parse(await readJson(request));
    const entry = await updateKnowledge(id, input, session.id);
    return jsonOk({ knowledge: entry });
  });
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const { id } = await context.params;
    await deleteKnowledge(id, session.id);
    return jsonOk({ ok: true });
  });
}
