import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260720130000_production_schema_reconciliation.sql",
);

describe("production schema reconciliation", () => {
  it("repairs the confirmed live application contracts", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS user_preferences JSONB");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS course_id UUID");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS fcm_token TEXT");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.asset_disposals");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.irrigation_schedules");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.irrigation_runs");
  });

  it("keeps new tables authenticated-only and does not seed fake irrigation data", () => {
    expect(migration).toContain(
      "REVOKE ALL ON public.asset_disposals FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated");
    expect(migration).not.toContain("INSERT INTO public.irrigation_zones");
  });

  it("uses inferable unique indexes for PostgREST push upserts", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX push_subscriptions_web_endpoint_key\n  ON public.push_subscriptions(endpoint);",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX push_subscriptions_fcm_token_key\n  ON public.push_subscriptions(fcm_token);",
    );
  });

  it("does not recreate retired member and community tables from migration 005", () => {
    expect(migration).not.toMatch(
      /CREATE TABLE IF NOT EXISTS public\.(?:community_posts|community_comments|community_likes|golfer_feedback|member_registrations|round_ratings|tee_times)/,
    );
  });

  it("removes runtime reads of the two retired 005 tables", () => {
    expect(read("src/app/dashboard/page.tsx")).not.toContain(
      '.from("golfer_feedback")',
    );
    expect(read("supabase/functions/morning-route/index.ts")).not.toContain(
      '.from("tee_times")',
    );
  });
});
