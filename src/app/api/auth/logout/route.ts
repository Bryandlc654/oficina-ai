import { jsonOk, route } from "@/lib/api";
import { clearSessionCookie, getSession } from "@/lib/auth/session";
import { logActivity } from "@/lib/services/activity";

export async function POST(): Promise<Response> {
  return route(async () => {
    const session = await getSession();
    await clearSessionCookie();

    if (session) {
      await logActivity({
        actorType: "ADMIN",
        actorId: session.id,
        action: "admin.logout",
        entityType: "User",
        entityId: session.id,
      });
    }

    return jsonOk({ ok: true });
  });
}
