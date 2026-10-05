/**
 * Import pro-shop / rec-aid schedule staff (pro_shop_staff table) into the
 * real staff system (profiles), so they show up everywhere staff do —
 * including the SF-52 employee dropdown for resignations etc.
 *
 * Uses the exact same provisioning path as the manual "Add Staff" sheet:
 * an invite row + the pin-signup edge function (auth user + profile +
 * pin_codes in one shot, no email sent). After the profile exists we seed
 * personnel_details with what the schedule knows (name split, position
 * title, Flex schedule) so an SF-52 at least fills the Name box — pay
 * fields stay blank until they're entered on the profile's Info tab.
 */
import { directInsertRow, directRpc, getCachedUserId } from "@/lib/supabase/rest";
import { callApi } from "@/lib/api/client";
import type { ProShopStaff, ProShopPosition } from "@/lib/pro-shop/types";
import type { Invite, InviteRole } from "@/types/database";

export function normalizeStaffName(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Schedule staff who don't have a matching profile yet (by normalized name).
 * Matching counts inactive profiles too, so someone marked inactive on the
 * staff roster is never re-added. People whose last day on the schedule
 * (employed_through) is already past have left and are skipped as well.
 */
export function findUnimportedScheduleStaff<
  T extends { full_name: string; employed_through?: string | null },
>(scheduleStaff: T[], existing: { full_name: string | null }[], todayIso?: string): T[] {
  const have = new Set(existing.map((p) => normalizeStaffName(p.full_name)).filter(Boolean));
  return scheduleStaff.filter((s) => {
    const n = normalizeStaffName(s.full_name);
    if (n.length === 0 || have.has(n)) return false;
    if (todayIso && s.employed_through && s.employed_through < todayIso) return false;
    return true;
  });
}

export function scheduleStaffPositionTitle(position: ProShopPosition): string {
  return position === "rec_aid" ? "Recreation Aide" : "Golf Operations Assistant";
}

/** "Aniya Marie Brackett" -> { first: "Aniya", middle: "Marie", last: "Brackett" }. */
export function splitStaffName(fullName: string): { first: string; middle: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", middle: "", last: "" };
  if (parts.length === 1) return { first: parts[0], middle: "", last: "" };
  return {
    first: parts[0],
    middle: parts.slice(1, -1).join(" "),
    last: parts[parts.length - 1],
  };
}

function randomPin(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

interface PinSignupResponse {
  success: boolean;
  user?: { id: string; name: string; role: string };
  error?: string;
}

export interface ImportScheduleStaffResult {
  added: string[];
  failed: { name: string; error: string }[];
}

/**
 * Create one staff account the same way the "Add Staff" sheet does: an
 * invite row, then pin-signup (auth user + profile + PIN, no email sent).
 * Returns the new profile id. The random PIN is retried on collisions.
 */
export async function provisionStaffAccount(
  fullName: string,
  options: { role?: InviteRole; phone?: string | null } = {},
): Promise<string> {
  const managerId = getCachedUserId();
  if (!managerId) throw new Error("You must be signed in to add staff.");

  const invite = await directInsertRow<Invite>(
    "invites",
    { role: options.role ?? "seasonal", email: null, created_by: managerId },
    "provisionStaffAccount.invite",
  );

  let lastError = "Failed to create the staff account.";
  // Random PINs can collide with existing ones — retry a couple times.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await callApi<PinSignupResponse>("pin-signup", {
      method: "POST",
      body: { token: invite.token, fullName, phone: options.phone || null, pin: randomPin() },
    });
    if (res?.success && res.user) return res.user.id;
    lastError = res?.error || lastError;
    if (!/PIN is already in use/i.test(lastError)) break;
  }
  throw new Error(lastError);
}

/**
 * Provision profiles for the given schedule staff. Continues past individual
 * failures so one bad row doesn't block the rest.
 */
export async function importScheduleStaff(staff: ProShopStaff[]): Promise<ImportScheduleStaffResult> {
  if (!getCachedUserId()) throw new Error("You must be signed in to add staff.");

  const result: ImportScheduleStaffResult = { added: [], failed: [] };

  for (const s of staff) {
    const name = s.full_name.trim();
    try {
      const userId = await provisionStaffAccount(name, { role: "seasonal", phone: s.phone || null });

      // Seed SF-52 personnel details with what the schedule knows. Best
      // effort — the profile exists either way.
      const split = splitStaffName(name);
      await directRpc(
        "update_staff_profile",
        {
          p_employee_id: userId,
          p_directory: {},
          p_personnel: {
            personnel_details: {
              name_first: split.first,
              name_middle: split.middle,
              name_last: split.last,
              position_title: scheduleStaffPositionTitle(s.position),
              work_schedule: "FLEX",
            },
          },
        },
        "importScheduleStaff.details",
      ).catch(() => {});

      result.added.push(name);
    } catch (e) {
      result.failed.push({ name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return result;
}
