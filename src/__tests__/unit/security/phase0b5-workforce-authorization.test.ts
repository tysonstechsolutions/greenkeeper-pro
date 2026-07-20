import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260720120000_phase0b5_workforce_authorization.sql",
);
const calendarHook = read("src/lib/calendar/use-calendar.ts");
const certificationsPage = read("src/app/certifications/page.tsx");
const onboardingHook = read("src/lib/onboarding/use-onboarding-docs.ts");
const scheduleHook = read("src/lib/hooks/useSchedule.ts");
const scheduleBoardHook = read("src/lib/hooks/useScheduleBoard.ts");
const crewsHook = read("src/lib/hooks/useCrews.ts");
const timeOffHook = read("src/lib/hooks/useTimeOff.ts");
const proShopHook = read("src/lib/pro-shop/use-pro-shop.ts");
const oneOnOneActions = read("src/lib/oneonone/apply-actions.ts");

describe("Phase 0B.5 workforce authorization migration", () => {
  it("removes broad policies and direct mutation grants from every protected domain", () => {
    for (const table of [
      "calendar_events",
      "certifications",
      "onboarding_documents",
      "schedules",
      "time_off_requests",
      "pro_shop_staff",
      "pro_shop_schedules",
      "pro_shop_shifts",
      "pro_shop_time_off",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("REVOKE ALL ON public.%I FROM anon, authenticated");
    expect(migration).not.toContain("FOR ALL TO authenticated USING (true)");
  });

  it("uses server-attributed commands with fixed search paths", () => {
    for (const command of [
      "save_calendar_event",
      "save_certification",
      "save_onboarding_document",
      "upsert_staff_schedule",
      "submit_time_off_request",
      "review_time_off_request",
      "save_pro_shop_staff",
      "replace_pro_shop_schedule_shifts",
      "publish_pro_shop_schedule",
    ]) {
      expect(migration).toContain(`FUNCTION public.${command}`);
    }
    expect(migration).toContain("v_actor UUID := auth.uid()");
    expect(migration).toContain("SET search_path TO 'pg_catalog', 'public'");
    expect(migration).toContain("Field % is not client-writable");
  });

  it("preserves terminal history and records audit plus outbox state atomically", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.domain_audit_events");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.operational_outbox_events");
    expect(migration).toContain("trg_protect_domain_audit_events");
    expect(migration).toContain("history cannot be deleted; use the protected terminal command");
    expect(migration).toContain("calendar_event_canceled");
    expect(migration).toContain("certification_retired");
    expect(migration).toContain("staff_schedule_voided");
    expect(migration).toContain("time_off_cancelled");
    expect(migration).toContain("pro_shop_shift_retired");
  });

  it("keeps qualification documents private and explicitly tracks legacy storage", () => {
    expect(migration).toContain("'certification-documents','certification-documents',FALSE");
    expect(migration).toContain("certification_documents_select");
    expect(migration).toContain("c.profile_id=auth.uid()");
    expect(migration).toContain("Legacy rows remain in photos");
    expect(certificationsPage).toContain("uploadCertificationDocument");
    expect(certificationsPage).toContain("openPrivateStorageFile");
    expect(certificationsPage).toContain("profile_id: fProfileId || null");
    expect(certificationsPage).toContain('directSelectList<StaffOption>("staff_directory"');
  });
});

describe("Phase 0B.5 application callers", () => {
  it("routes calendar and approved one-on-one follow-ups through commands", () => {
    expect(calendarHook).toContain('directRpc("save_calendar_event"');
    expect(calendarHook).toContain('directRpc("cancel_calendar_event"');
    expect(calendarHook).not.toContain('directDeleteRow("calendar_events"');
    expect(oneOnOneActions).toContain('"create_time_off_request_for_employee"');
    expect(oneOnOneActions).toContain('"save_calendar_event"');
  });

  it("routes qualification and onboarding definition changes through commands", () => {
    expect(certificationsPage).toContain('directRpc("save_certification"');
    expect(certificationsPage).toContain('directRpc("retire_certification"');
    expect(onboardingHook).toContain('directRpc("save_onboarding_document"');
    expect(onboardingHook).toContain('directRpc("retire_onboarding_document"');
    expect(onboardingHook).toContain('directRpc("sync_onboarding_documents"');
  });

  it("routes schedule and time-off state transitions through commands", () => {
    expect(scheduleHook).toContain('directRpc<Schedule>("upsert_staff_schedule"');
    expect(scheduleHook).toContain('directRpc("bulk_upsert_staff_schedules"');
    expect(scheduleHook).toContain('directRpc("void_staff_schedule"');
    expect(scheduleBoardHook).toContain('directRpc("upsert_staff_schedule"');
    expect(scheduleBoardHook).toContain('directRpc("void_staff_schedule"');
    expect(scheduleBoardHook).not.toContain('directDeleteRow(\n            "schedules"');
    expect(crewsHook).toContain('directRpc("upsert_staff_schedule"');
    expect(crewsHook).toContain('directRpc("bulk_upsert_staff_schedules"');
    expect(crewsHook).not.toContain('.from("schedules")');
    expect(timeOffHook).toContain('directRpc<TimeOffRequest>("submit_time_off_request"');
    expect(timeOffHook).toContain('directRpc("review_time_off_request"');
    expect(timeOffHook).toContain('directRpc("cancel_time_off_request"');
  });

  it("makes pro-shop generation retry-safe and removes hard-delete callers", () => {
    expect(proShopHook).toContain('directRpc("replace_pro_shop_schedule_shifts"');
    expect(proShopHook).toContain('directRpc("retire_pro_shop_shift"');
    expect(proShopHook).toContain('directRpc("retire_pro_shop_time_off"');
    expect(proShopHook).not.toContain("directDeleteRow");
    expect(proShopHook).not.toContain("directDeleteByFilter");
    expect(migration).toContain("idx_pro_shop_shifts_active_generation");
  });
});
