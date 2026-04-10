import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Internal password used for PIN-authenticated users
// The PIN is the actual auth factor; this password is stored in env vars
const PIN_USER_PASSWORD = process.env.PIN_USER_PASSWORD || process.env.NEXT_PIN_USER_PASSWORD || "";

// Simple in-memory rate limiting for PIN attempts
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 5; // max attempts
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

export async function POST(request: Request) {
  try {
    // Check PIN_USER_PASSWORD is configured
    if (!PIN_USER_PASSWORD) {
      console.error("PIN_USER_PASSWORD environment variable is not set");
      return NextResponse.json(
        { error: "PIN login is not configured. Contact your administrator." },
        { status: 500 }
      );
    }

    // Rate limiting by IP
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many PIN attempts. Please wait a minute and try again." },
        { status: 429 }
      );
    }

    const { pin } = await request.json();

    if (!pin || typeof pin !== "string" || pin.length < 4 || pin.length > 6) {
      return NextResponse.json(
        { error: "Please enter a valid 4-6 digit PIN" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    // Create a Supabase client with cookie access
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server component context
            }
          },
        },
      }
    );

    // Look up the PIN in the pin_codes table
     
    const { data: pinRecord, error: pinError } = await supabase.from("pin_codes")
      .select("user_id, is_active")
      .eq("pin", pin)
      .eq("is_active", true)
      .single();

    if (pinError || !pinRecord) {
      return NextResponse.json(
        { error: "Invalid PIN. Please try again." },
        { status: 401 }
      );
    }

    // Get the user's email from profiles
     
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("email, full_name, role")
      .eq("id", pinRecord.user_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User account not found. Contact your superintendent." },
        { status: 404 }
      );
    }

    // Sign in using the user's email and the internal PIN password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: PIN_USER_PASSWORD,
    });

    if (authError) {
      console.error("PIN auth sign-in failed:", authError.message, "code:", authError.code, "status:", authError.status);
      return NextResponse.json(
        { error: "PIN login failed. Please contact your superintendent." },
        { status: 401 }
      );
    }

    // Determine redirect based on role
    let redirectPath = "/dashboard";
    if (profile.role === "member") {
      redirectPath = "/member/home";
    } else if (profile.role === "pro") {
      redirectPath = "/pro-dashboard";
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user?.id,
        name: profile.full_name,
        role: profile.role,
      },
      redirectPath,
    });
  } catch (err) {
    console.error("PIN login error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
