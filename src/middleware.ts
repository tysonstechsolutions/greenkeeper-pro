import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (PWA manifest — must be publicly accessible)
     * - sw.js (service worker — must be publicly accessible)
     * - .well-known (TWA asset links, etc. — must be publicly accessible)
     * - public folder static asset files
     */
    "/((?\!_next/static|_next/image|favicon.ico|manifest.json|sw\\.js|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
