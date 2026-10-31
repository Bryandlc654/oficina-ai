import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { updateProvider } from "@/lib/services/providers";
import { providerUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const { id } = await context.params;
    const input = providerUpdateSchema.parse(await readJson(request));
    const provider = await updateProvider(id, input, session.id);
    return jsonOk({ provider });
  });
}
