import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE = "avo_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN";
};

export type SessionPayload = SessionUser & JWTPayload;

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser, secret: string): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string" || payload.role !== "ADMIN") {
      return null;
    }

    return {
      ...payload,
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email,
      role: "ADMIN",
    };
  } catch {
    return null;
  }
}
