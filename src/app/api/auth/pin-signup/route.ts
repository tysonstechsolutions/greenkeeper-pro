import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Internal password used for every PIN-authenticated user. The PIN itself
// is the real auth factor; this shared password is server-side only.
const PIN_USER_PASSWORD = process.env.PIN_USER_PASSWORD || process.env.NEXT_PIN_USER_PASSWORD || "";

type InviteRecord = {
  id: string;
  token: string;
  role: string;
  email: string | null;
  expires_at: string;
  used_by: string | null;
};

type ProfileRecord = {
  id: string;
  role: string;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24) || "user";
}

export async function POST(request: Request) {
  try {
    if (!PIN_USER_PASSWORD) {
      return NextResponse.json(
        { error: "PIN signup is not configured. Contact your administrator." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const token = String(body?.token || "").trim();
    const fullName = String(body?.fullName || "").trim();
    const phone = body?.phone ? String(body.phone).trim() : null;
    const pin = String(body?.pin || "").trim();

    if (!token) {
      return NextResponse.json({ error: "Missing invite token." }, { status: 400 });
    }
    if (!fullName || fullName.length < 2) {
      return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
    }
    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { error: "PIN must be 4–6 digits." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
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

    // 1. Validate invite.
     
    const { data: inviteData, error: inviteError } = await supabase.from("invites")
      .select("id, token, role, email, expires_at, used_by")
      .eq("token", token)
      .single();

    if (inviteError || !inviteData) {
      return NextResponse.json({ error: "Invalid or expired invite." }, { status: 400 });
    }
    const invite = inviteData as InviteRecord;
    if (invite.used_by) {
      return NextResponse.json({ error: "This invite has already been used." }, { status: 400 });
    }
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: "This invite has expired." }, { status: 400 });
    }

    // 2. Make sure the chosen PIN isn't already taken.
     
    const { data: existingPin } = await supabase.from("pin_codes")
      .select("pin")
      .eq("pin", pin)
      .eq("is_active", true)
      .maybeSingle();
    if (existingPin) {
      return NextResponse.json(
        { error: "That PIN is already in use. Please pick a different one." },
        { status: 409 }
      );
    }

    // 3. Derive an email for the auth.users row. Invites may specify one;
    //    otherwise we synthesize a stable pseudo-email based on the name + PIN.
    const email =
      invite.email && invite.email.includes("@")
        ? invite.email
        : `${slugify(fullName)}.${pin}@vmgc.mil`;

    // 4. Create the auth user with the shared PIN password.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: PIN_USER_PASSWORD,
      options: {
        data: {
          full_name: fullName,
          role: invite.role,
        },
      },
    });

    if (signUpError) {
      console.error("PIN signup: auth signUp failed", signUpError);
      return NextResponse.json(
        { error: signUpError.message || "Failed to create account." },
        { status: 400 }
      );
    }

    const newUser = signUpData.user;
    if (!newUser) {
      return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
    }

    // 5. Upsert profile fields. A trigger may have already inserted the row.
     
    const { error: profileError } = await supabase.from("profiles")
      .upsert(
        {
          id: newUser.id,
          email,
          full_name: fullName,
          phone,
          role: invite.role,
        },
        { onConflict: "id" }
      );
    if (profileError) {
      console.error("PIN signup: profile upsert failed", profileError);
    }

    // 6. Insert pin_codes row.
     
    const { error: pinError } = await supabase.from("pin_codes").insert({
      pin,
      user_id: newUser.id,
      is_active: true,
    });
    if (pinError) {
      console.error("PIN signup: pin_codes insert failed", pinError);
      return NextResponse.json(
        { error: "Account created but PIN could not be set. Contact your administrator." },
        { status: 500 }
      );
    }

    // 7. Mark the invite used.
     
    await supabase.from("invites")
      .update({ used_by: newUser.id, used_at: new Date().toISOString() })
      .eq("id", invite.id);

    // 8. Sign the new user in so they land on the dashboard ready to go.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: PIN_USER_PASSWORD,
    });
    if (signInError) {
      console.error("PIN signup: sign-in after signup failed", signInError);
      // Non-fatal — they can enter their PIN on /pin-login.
    }

    // 9. Role-based redirect.
    const profile: ProfileRecord = { id: newUser.id, role: invite.role };
    let redirectPath = "/dashboard";
    if (profile.role === "member") redirectPath = "/member/home";
    else if (profile.role === "pro") redirectPath = "/pro-dashboard";

    return NextResponse.json({
      success: true,
      user: { id: newUser.id, name: fullName, role: invite.role },
      redirectPath,
    });
  } catch (err) {
    console.error("PIN signup error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
