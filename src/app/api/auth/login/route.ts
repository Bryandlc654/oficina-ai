import { db } from "@/lib/db";
import { jsonError, jsonOk, readJson, route } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { logActivity } from "@/lib/services/activity";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const limit = checkRateLimit(`login:${ip}`);
    if (!limit.allowed) {
      return jsonError(
        `Demasiados intentos. Vuelve a intentarlo en ${limit.retryAfterSeconds} segundos.`,
        429,
        "RATE_LIMITED",
      );
    }

    const input = loginSchema.parse(await readJson(request));
    const user = await db.user.findUnique({ where: { email: input.email } });
    const validPassword = user ? await verifyPassword(input.password, user.passwordHash) : false;

    if (!user || !validPassword) {
      return jsonError("Credenciales inválidas", 401, "INVALID_CREDENTIALS");
    }

    resetRateLimit(`login:${ip}`);

    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: "ADMIN",
    });
    await setSessionCookie(token);

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await logActivity({
      actorType: "ADMIN",
      actorId: user.id,
      action: "admin.login",
      entityType: "User",
      entityId: user.id,
    });

    return jsonOk({ user: { id: user.id, email: user.email, name: user.name } });
  });
}
