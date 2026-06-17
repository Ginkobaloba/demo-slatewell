import { NextResponse, type NextRequest } from "next/server";

const ADMIN_COOKIE = "slatewell_admin_session";

/**
 * Behind the demo reverse proxy, request.url's origin is the container's
 * internal bind address (0.0.0.0:3000), so NextResponse.redirect(new
 * URL(path, request.url)) would ship an absolute Location pointing at an
 * unreachable host. A path-relative Location lets the browser resolve
 * against the real public origin. (Same fix merged into lumen/axlepoint.)
 */
function relativeRedirect(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: NextRequest) {
  const signout = request.nextUrl.searchParams.get("signout");
  if (signout) {
    const res = relativeRedirect("/");
    res.cookies.delete(ADMIN_COOKIE);
    return res;
  }
  const res = relativeRedirect("/admin");
  res.cookies.set(ADMIN_COOKIE, "demo-admin", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return res;
}
