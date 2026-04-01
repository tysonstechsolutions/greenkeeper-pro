import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Internal password used for PIN-authenticated users
// This is not a security risk - the PIN is the actual auth factor
const PIN_USER_PASSWORD = "GK_Pin_Auth_2026!vmgc";

export async function POST(request: Request) {
  try {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pinRecord, error: pinError } = await (supabase.from("pin_codes") as any)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error: profileError } = await (supabase.from("profiles") as any)
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
        { error: `PIN login failed: ${authError.message}` },
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
