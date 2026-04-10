import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Define public routes that don't require authentication
  const publicRoutes = [
    "/login",
    "/pin-login",
    "/invite",
    "/auth/callback",
    "/auth/confirm",
    "/join",
    "/api/auth/pin-login",
    "/api/auth/pin-signup",
    "/.well-known",
    "/manifest.json",
    "/sw.js",
    "/icons",
    "/twa",
  ];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  // If user is not logged in and trying to access a protected route,
  // redirect to the PIN login page (email login has been retired).
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/pin-login";
    return NextResponse.redirect(url);
  }

  // If user is logged in and trying to access the login pages,
  // redirect to appropriate dashboard based on role
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/pin-login")) {
    const url = request.nextUrl.clone();
    // For now, redirect to dashboard - the client-side will handle role-based routing
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Member-only routes - if member tries to access staff routes, redirect to member home
  const staffOnlyRoutes = [
    "/dashboard",
    "/tasks",
    "/schedule",
    "/messages",
    "/equipment",
    "/chemicals",
    "/irrigation",
    "/staff",
    "/budget",
    "/reports",
    "/knowledge",
    "/plan",
    "/pro-dashboard",
    "/report-issue",
  ];

  // Member routes - staff cannot access these
  const memberOnlyRoutes = ["/member"];

  // We can't check role in middleware without a database call, so we'll handle
  // role-based redirects on the client side in a layout component

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
