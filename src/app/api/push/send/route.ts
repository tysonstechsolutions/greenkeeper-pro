import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUsers, isPushConfigured } from "@/lib/utils/push";

const STAFF_ROLES = new Set(["super", "asst_super", "director", "foreman"]);

/**
 * POST /api/push/send
 * Body: { user_ids: string[], title: string, body: string, url?: string }
 *
 * Staff roles can push to arbitrary users. Regular users can only push to themselves.
 * Returns 503 if VAPID private key is not configured on the server.
 */
export async function POST(request: Request) {
  if (!isPushConfigured()) {
    console.error(
      "[push/send] VAPID keys not configured; refusing to send push."
    );
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
    const userIds: unknown = body?.user_ids;
    const title: unknown = body?.title;
    const messageBody: unknown = body?.body;
    const url: unknown = body?.url;

    if (
      !Array.isArray(userIds) ||
      userIds.length === 0 ||
      !userIds.every((u) => typeof u === "string") ||
      typeof title !== "string" ||
      typeof messageBody !== "string" ||
      (url !== undefined && typeof url !== "string")
    ) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 }
      );
    }

    // Look up sender role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (profile as { role?: string } | null)?.role;
    const isStaff = typeof role === "string" && STAFF_ROLES.has(role);

    let targetUserIds = userIds as string[];
    if (!isStaff) {
      // Non-staff can only push to themselves (self-test)
      targetUserIds = targetUserIds.filter((id) => id === user.id);
      if (targetUserIds.length === 0) {
        return NextResponse.json(
          { error: "Forbidden: non-staff can only push to self" },
          { status: 403 }
        );
      }
    }

    const result = await sendPushToUsers({
      supabase,
      userIds: targetUserIds,
      title,
      body: messageBody,
      url: typeof url === "string" ? url : undefined,
    });

    return NextResponse.json({
      sent: result.sent,
      failed: result.failed,
      pruned: result.prunedEndpoints.length,
    });
  } catch (err) {
    console.error("[push/send] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
