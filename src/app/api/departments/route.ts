import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { createDepartment, listDepartments } from "@/lib/services/organization";
import { departmentCreateSchema } from "@/lib/validation";

export async function GET(): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    return jsonOk({ departments: await listDepartments() });
  });
}

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const input = departmentCreateSchema.parse(await readJson(request));
    const department = await createDepartment(input, session.id);
    return jsonOk({ department }, 201);
  });
}
