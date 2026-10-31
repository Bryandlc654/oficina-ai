import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { listChannelMessages, postAdminMessage } from "@/lib/services/chat";
import { chatChannelSchema, chatMessageCreateSchema } from "@/lib/validation";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    const channel = chatChannelSchema.parse(new URL(request.url).searchParams.get("channel") ?? "group");
    return jsonOk({ messages: await listChannelMessages(channel) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const input = chatMessageCreateSchema.parse(await readJson(request));
    const message = await postAdminMessage(input.channel, input.content, { id: session.id, name: session.name });
    return jsonOk({ message }, 201);
  });
}
