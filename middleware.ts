import { NextResponse } from "next/server";

const SUPPORTED = ["en", "hi", "ta"];

export function middleware(req: Request) {
  const url = new URL(req.url);
  const { pathname } = url;

  // Ignore Next internals, API, and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Already has a supported locale prefix? Allow.
  const seg = pathname.split("/")[1];
  if (SUPPORTED.includes(seg)) return NextResponse.next();

  // Prepend default locale
  url.pathname = `/en${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Match all paths except _next, api, and files with extensions
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
