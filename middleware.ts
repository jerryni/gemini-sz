import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const ua = request.headers.get("user-agent") || "";
  if (ua.includes("curl") || ua === "") {
    return new Response("Blocked", { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*"
};
