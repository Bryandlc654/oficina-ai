import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";

function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons") ||
    /\.(?:png|jpe?g|gif|svg|webp|ico|css|js|map|txt|woff2?)$/i.test(pathname)
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token && secret ? await verifySessionToken(token, secret) : null;
  const isLoginPage = pathname === "/login";
  const isAuthApi = pathname.startsWith("/api/auth/");
  const isHealth = pathname === "/api/health";

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!session) {
    if (isLoginPage || isAuthApi || isHealth) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { message: "Authentication required", code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
