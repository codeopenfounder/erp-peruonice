import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Skip middleware on static assets and downloadable artifacts. Anything not
    // listed here goes through updateSession, which on unauthenticated requests
    // returns the /login HTML — that's why .exe/.json/.bin previously broke.
    "/((?!_next/static|_next/image|favicon.ico|api/|downloads/|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|exe|bin|json|woff|woff2|ttf|otf|map|txt|xml|wasm)$).*)",
  ],
};
