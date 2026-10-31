import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { getTaskDetail, updateTask } from "@/lib/services/tasks";
import { taskUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    const { id } = await context.params;
    return jsonOk({ task: await getTaskDetail(id) });
  });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const { id } = await context.params;
    const input = taskUpdateSchema.parse(await readJson(request));
    const task = await updateTask(id, input, session.id);
    return jsonOk({ task });
  });
}
