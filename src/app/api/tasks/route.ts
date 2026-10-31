import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { createTask, listTasks } from "@/lib/services/tasks";
import { taskCreateSchema } from "@/lib/validation";

export async function GET(): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    return jsonOk({ tasks: await listTasks() });
  });
}

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const input = taskCreateSchema.parse(await readJson(request));
    const task = await createTask(input, session.id);
    return jsonOk({ task }, 201);
  });
}
