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
import { directInsertRow, directPatchRow, getCachedUserId } from "@/lib/supabase/rest";
import { callApi } from "@/lib/api/client";
import type { ProShopStaff, ProShopPosition } from "@/lib/pro-shop/types";
import type { Invite } from "@/types/database";

export function normalizeStaffName(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Schedule staff who don't have a matching profile yet (by normalized name). */
export function findUnimportedScheduleStaff<T extends { full_name: string }>(
  scheduleStaff: T[],
  existing: { full_name: string | null }[],
): T[] {
  const have = new Set(existing.map((p) => normalizeStaffName(p.full_name)).filter(Boolean));
  return scheduleStaff.filter((s) => {
    const n = normalizeStaffName(s.full_name);
    return n.length > 0 && !have.has(n);
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
 * Provision profiles for the given schedule staff. Continues past individual
 * failures so one bad row doesn't block the rest.
 */
export async function importScheduleStaff(staff: ProShopStaff[]): Promise<ImportScheduleStaffResult> {
  const managerId = getCachedUserId();
  if (!managerId) throw new Error("You must be signed in to add staff.");

  const result: ImportScheduleStaffResult = { added: [], failed: [] };

  for (const s of staff) {
    const name = s.full_name.trim();
    try {
      // Same flow as the Add Staff sheet: invite -> pin-signup.
      const invite = await directInsertRow<Invite>(
        "invites",
        { role: "seasonal", email: null, created_by: managerId },
        "importScheduleStaff.invite",
      );

      let user: { id: string } | null = null;
      let lastError = "Failed to create the staff account.";
      // Random PINs can collide with existing ones — retry a couple times.
      for (let attempt = 0; attempt < 3 && !user; attempt++) {
        const res = await callApi<PinSignupResponse>("pin-signup", {
          method: "POST",
          body: { token: invite.token, fullName: name, phone: s.phone || null, pin: randomPin() },
        });
        if (res?.success && res.user) {
          user = res.user;
        } else {
          lastError = res?.error || lastError;
          if (!/PIN is already in use/i.test(lastError)) break;
        }
      }
      if (!user) throw new Error(lastError);

      // Seed SF-52 personnel details with what the schedule knows. Best
      // effort — the profile exists either way.
      const split = splitStaffName(name);
      await directPatchRow(
        "profiles",
        "id",
        user.id,
        {
          personnel_details: {
            name_first: split.first,
            name_middle: split.middle,
            name_last: split.last,
            position_title: scheduleStaffPositionTitle(s.position),
            work_schedule: "Flex",
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
