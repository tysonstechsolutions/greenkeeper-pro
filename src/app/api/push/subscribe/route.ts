import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/push/subscribe
 * Body: { subscription: PushSubscriptionJSON, user_agent?: string }
 *
 * Upserts a web push subscription for the authenticated user, keyed by endpoint.
 * Returns 503 if VAPID keys are not configured on the server.
 */
export async function POST(request: Request) {
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return NextResponse.json(
      { error: "Push not configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const subscription = body?.subscription;
    const userAgent =
      typeof body?.user_agent === "string" ? body.user_agent : null;

    if (
      !subscription ||
      typeof subscription.endpoint !== "string" ||
      !subscription.keys ||
      typeof subscription.keys.p256dh !== "string" ||
      typeof subscription.keys.auth !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid subscription payload" },
        { status: 400 }
      );
    }

    const row = {
      user_id: user.id,
      endpoint: subscription.endpoint as string,
      p256dh: subscription.keys.p256dh as string,
      auth: subscription.keys.auth as string,
      user_agent: userAgent,
      last_used_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: upsertError } = await (supabase as any)
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" })
      .select("id")
      .single();

    if (upsertError) {
      console.error("[push/subscribe] upsert failed:", upsertError);
      return NextResponse.json(
        { error: upsertError.message || "Failed to save subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: data?.id ?? null });
  } catch (err) {
    console.error("[push/subscribe] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/push/subscribe
 * Body: { endpoint: string }
 *
 * Removes a subscription by endpoint for the authenticated user.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const endpoint = body?.endpoint;

    if (typeof endpoint !== "string" || !endpoint) {
      return NextResponse.json(
        { error: "Missing endpoint" },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("[push/subscribe] delete failed:", deleteError);
      return NextResponse.json(
        { error: deleteError.message || "Failed to delete subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push/subscribe DELETE] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
