import { NextResponse, type NextRequest } from "next/server";
import { SIGNED_IN_COOKIE } from "@/lib/auth";

// higoverse.com/ is two pages in one: the dashboard for people signed in on
// this browser, and the public home page (app/welcome) for everyone else,
// search engines included. Sign-in lives in the browser (localStorage), so a
// yes/no cookie set at sign-in tells the server which one to send. Every
// other address is left alone.
export function proxy(request: NextRequest) {
  if (request.cookies.get(SIGNED_IN_COOKIE)?.value === "1") return NextResponse.next();
  const res = NextResponse.rewrite(new URL("/welcome", request.url));
  // The same address answers differently per visitor: never cache it shared.
  res.headers.set("Cache-Control", "private, no-cache");
  res.headers.set("Vary", "Cookie");
  return res;
}

export const config = { matcher: "/" };
