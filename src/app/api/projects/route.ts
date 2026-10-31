import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { createProject, listProjects } from "@/lib/services/organization";
import { projectCreateSchema } from "@/lib/validation";

export async function GET(): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    return jsonOk({ projects: await listProjects() });
  });
}

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const input = projectCreateSchema.parse(await readJson(request));
    const project = await createProject(input, session.id);
    return jsonOk({ project }, 201);
  });
}
