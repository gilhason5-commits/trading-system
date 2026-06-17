import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optional HTTP Basic Auth gate. Active only when APP_PASSWORD is set (e.g. on the
// public Vercel deploy) — protects every page and API route so the portfolio and
// the write endpoints aren't open to anyone with the URL. Locally, with no
// APP_PASSWORD, it's a no-op.
export function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const pass = decoded.slice(decoded.indexOf(":") + 1);
    if (pass === pw) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Trading System", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except Next's static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
