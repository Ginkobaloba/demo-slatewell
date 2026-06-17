import { NextResponse, type NextRequest } from "next/server";

export const ADMIN_COOKIE = "slatewell_admin_session";

export function middleware(request: NextRequest) {
  if (!request.cookies.has(ADMIN_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "?admin=required";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
