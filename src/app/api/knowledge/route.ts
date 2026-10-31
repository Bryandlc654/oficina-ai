import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { createKnowledge, listCompanyKnowledge } from "@/lib/services/memory";
import { knowledgeCreateSchema } from "@/lib/validation";

export async function GET(): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    return jsonOk({ knowledge: await listCompanyKnowledge() });
  });
}

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const input = knowledgeCreateSchema.parse(await readJson(request));
    const entry = await createKnowledge(input, session.id);
    return jsonOk({ knowledge: entry }, 201);
  });
}
