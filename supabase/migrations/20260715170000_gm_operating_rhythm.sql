-- ============================================================================
-- The GM's operating rhythm — the recurring work of running the business.
--
-- Seeds the obligations Tyson named that the app could not previously track,
-- across the course, the restaurant, the pro shop, and MWR/CNIC compliance.
-- These are the "what do I have to do to be successful" items that were living
-- in his head rather than in the system.
--
-- ALREADY PRESENT (deliberately NOT duplicated): tank-inspections,
-- fire-extinguishers, revenue-rollup, spend-totals, pro-shop-inventory,
-- restaurant-inventory, 889-renewals, fy-rollover, greens-aeration-*,
-- overseed, winterize-irrigation, reladyne-gauge, simulator-setup.
--
-- SOURCE HONESTY: these are MANAGEMENT-DEFINED operating standards — Tyson's
-- own rhythm — except where an external deadline is the actual driver (payroll
-- close, MWR/CNIC reporting). None is labelled as an authoritative Navy/CNIC
-- citation, because the exact instruction number isn't recorded here. Where a
-- real deadline exists but its authority is unconfirmed, `notes` says so and it
-- needs management confirmation.
--
-- Ownership: every one is assigned to the GM. He can delegate any of them.
-- Idempotent: ON CONFLICT (slug) refreshes definition fields only.
-- ============================================================================

DO $$
DECLARE
  gm UUID;
BEGIN
  SELECT id INTO gm FROM public.profiles WHERE role = 'gm' AND is_active LIMIT 1;

  INSERT INTO public.obligations
    (slug, title, detail, workspace, cadence, due_day, due_weekday, due_month,
     lead_days, delegable, link_href, is_active, sort_order, owner_profile_id,
     why_it_matters, evidence_requirements, notes)
  VALUES
    -- ── Payroll / people ──────────────────────────────────────────────────
    ('kronos-timecards',
     'Fix Kronos timecards',
     'Pay period runs Sunday–Saturday. Review and correct every timecard for the week that just closed — missed punches, meal breaks, leave codes — before payroll processes.',
     'people', 'weekly', 1, 1, NULL, 1, TRUE, NULL, TRUE, 1, gm,
     'Payroll runs on these. A missed correction means someone is paid wrong, and fixing it after the fact is a pay adjustment, not an edit.',
     '["Timecards approved in Kronos for the closed pay period"]'::jsonb,
     'Deadline set to Monday to close the Sun–Sat period; confirm the exact payroll cutoff with NAF HR.'),

    ('crew-schedule-next-month',
     'Publish next month''s crew schedule',
     'Build and publish the crew schedule for the coming month before the current one ends, so staff know their shifts with notice.',
     'people', 'monthly', -1, NULL, NULL, 7, TRUE, '/schedule', TRUE, 2, gm,
     'People plan their lives around this. A late schedule costs goodwill and creates call-outs.',
     '["Schedule published for the full month"]'::jsonb,
     NULL),

    ('monthly-one-on-ones',
     'Run monthly 1:1s with each employee',
     'Sit down with every employee for their monthly 1:1. Questions personalize from their history.',
     'people', 'monthly', -1, NULL, NULL, 10, FALSE, '/staff', TRUE, 3, gm,
     'This is how you hear problems while they are still small, and how the crew knows they are listened to.',
     '["A completed 1:1 session recorded for each active employee"]'::jsonb,
     NULL),

    ('hiring-pipeline-review',
     'Review hiring pipeline and vacancies',
     'Check open requisitions, candidate status, and seasonal staffing needs against the coming month.',
     'people', 'monthly', 15, NULL, NULL, 5, TRUE, NULL, TRUE, 4, gm,
     'Vacancies quietly become the reason everything else slips. Catch them before the season does.',
     '[]'::jsonb,
     NULL),

    ('certifications-review',
     'Review staff certifications and expirations',
     'Check every required certification and license for upcoming expiry; start renewals early.',
     'people', 'monthly', 1, NULL, NULL, 10, TRUE, '/certifications', TRUE, 5, gm,
     'An expired certification can stop someone working, or stop a chemical application entirely.',
     '["Expiring certs identified and renewal started"]'::jsonb,
     NULL),

    -- ── Money / reporting ─────────────────────────────────────────────────
    ('monthly-financial-review',
     'Review monthly financials by area',
     'Review revenue, spend, and budget position for the course, restaurant, and pro shop against plan.',
     'money', 'monthly', 10, NULL, NULL, 5, FALSE, '/financial-watch', TRUE, 6, gm,
     'This is the month you can still change. Finding a shortfall in the annual review is finding it too late.',
     '[]'::jsonb,
     NULL),

    ('mwr-reporting',
     'Submit required MWR/CNIC reporting',
     'Prepare and submit the recurring reports required by MWR/CNIC for the golf program.',
     'money', 'monthly', 5, NULL, NULL, 5, FALSE, '/reports', TRUE, 7, gm,
     'These are required submissions, not internal paperwork. Missing one is a finding against the program.',
     '["Report submitted and a copy filed"]'::jsonb,
     'NEEDS MANAGEMENT CONFIRMATION: the exact CNIC/MWR report set, submission channel, and due date are not recorded in the app. Confirm and correct this obligation.'),

    -- ── Assets / equipment ────────────────────────────────────────────────
    ('asset-photos',
     'Photograph assets missing a picture',
     'Work through the asset list and photograph any item without a current picture on its record.',
     'course', 'monthly', 20, NULL, NULL, 7, TRUE, '/assets', TRUE, 8, gm,
     'A photo is what makes an inventory defensible — and it is what you need when something is damaged, surveyed, or disputed.',
     '["Photo attached to each asset record"]'::jsonb,
     NULL),

    -- ── Course / operations ───────────────────────────────────────────────
    ('irrigation-audit',
     'Walk irrigation and log problems',
     'Walk the system, check coverage and heads, and log what needs repair.',
     'course', 'monthly', 1, NULL, NULL, 5, TRUE, '/irrigation/map', TRUE, 9, gm,
     'Water is the difference between turf recovering and turf dying. Small irrigation faults become dead areas.',
     '[]'::jsonb,
     NULL),

    ('facility-cleaning-check',
     'Facility cleaning and trash walkthrough',
     'Walk the clubhouse, restrooms, cart barn, and grounds. Check cleaning standards and trash service.',
     'general', 'weekly', 1, 5, NULL, 1, TRUE, '/clubhouse', TRUE, 10, gm,
     'This is the first thing a guest notices and the first thing an inspection notices.',
     '[]'::jsonb,
     NULL),

    -- ── Pro shop / revenue programs ───────────────────────────────────────
    ('league-setup',
     'Set up next season''s leagues',
     'Confirm league nights, rosters, fees, and the schedule for Wednesday and Thursday leagues before the season.',
     'pro_shop', 'annual', 15, NULL, 2, 30, TRUE, NULL, TRUE, 11, gm,
     'Leagues are committed, repeat revenue. Setting them up late costs a whole season of it.',
     '[]'::jsonb,
     NULL),

    ('marketing-push',
     'Plan and run the monthly marketing push',
     'Plan promotion for the coming month — events, specials, Hot Dog Monday, league nights — and get it out.',
     'pro_shop', 'monthly', 25, NULL, NULL, 7, TRUE, NULL, TRUE, 12, gm,
     'Rounds and covers do not happen by themselves. Nobody shows up to something they never heard about.',
     '[]'::jsonb,
     NULL),

    -- ── Admin ─────────────────────────────────────────────────────────────
    ('staff-meeting',
     'Hold the staff meeting',
     'Run the recurring all-hands: priorities, safety, upcoming events, and what changed.',
     'people', 'monthly', 1, NULL, NULL, 5, FALSE, NULL, TRUE, 13, gm,
     'It is the cheapest way to get everyone pointed the same direction, and the only time some staff hear anything directly from you.',
     '[]'::jsonb,
     NULL)

  ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    detail = EXCLUDED.detail,
    workspace = EXCLUDED.workspace,
    cadence = EXCLUDED.cadence,
    due_day = EXCLUDED.due_day,
    due_weekday = EXCLUDED.due_weekday,
    due_month = EXCLUDED.due_month,
    lead_days = EXCLUDED.lead_days,
    link_href = EXCLUDED.link_href,
    why_it_matters = EXCLUDED.why_it_matters,
    evidence_requirements = EXCLUDED.evidence_requirements,
    notes = EXCLUDED.notes,
    updated_at = now();

  -- Existing obligations had no owner at all. Give the unowned ones to the GM;
  -- he can delegate from there. Never overwrite an owner already set.
  UPDATE public.obligations
  SET owner_profile_id = gm
  WHERE owner_profile_id IS NULL AND is_active AND gm IS NOT NULL;
END $$;

notify pgrst, 'reload schema';
