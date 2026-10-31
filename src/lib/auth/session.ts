import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "../env";
import { UnauthorizedError } from "../errors";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  verifySessionToken,
  type SessionPayload,
  type SessionUser,
} from "./jwt";

export { SESSION_COOKIE, type SessionPayload, type SessionUser };

export async function createSessionToken(user: SessionUser): Promise<string> {
  return signSession(user, getEnv().AUTH_SECRET);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token, getEnv().AUTH_SECRET);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** For route handlers: throws a typed 401 instead of redirecting. */
export async function requireApiSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
