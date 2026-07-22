-- ============================================================================
-- Seed the crew's recurring duties from the GM's task-menu assignments
-- (2026-07-22). 155 standing duties across the three areas, assigned BY ROLE
-- (role_group) rather than to individuals — the course runs record-only
-- delegation with no staff logins, so ownership stays at the role level and
-- the /operations/duties page groups the printable lists by role.
--
-- WHY RAW INSERT (not save_operation_duty): the atomic RPC enforces a
-- GM-only guard via auth.uid(), which is NULL inside a migration. This block
-- replicates exactly what the RPC's insert branch does — the operation_duties
-- row plus its initial duty_recurrence_versions row. The task_series row is
-- created automatically by the sync_operation_duty_series trigger, and
-- materialize_duty_occurrences() (service-role only; callable here as owner)
-- generates the near-term executable occurrences.
--
-- SCHEDULE MODEL
--   daily            -> cadence daily,  weekdays []      (every day in season)
--   set weekdays     -> cadence weekly, weekdays [...]   (those days)
--   monthly          -> cadence monthly, day_of_month 1
--   seasonal         -> recorded only; dormant (in_season, no dates) — the GM
--                       schedules aeration/overseeding by hand each season
--   as needed        -> recorded only; dormant (in_season, no dates)
--
-- SEASON
--   Outdoor course work (greens/tees, bunkers, course detailing, range,
--   irrigation, turf care) runs the operating season, Apr 1 – Nov 1.
--   Facility work (clubhouse, pro shop, carts, kitchen, shop, admin) is
--   year-round. Adjust any of this on the Duty ownership page.
--
-- Idempotent: guarded on legacy_source; re-running is a no-op.
-- ============================================================================

DO $$
DECLARE
  r          RECORD;
  v_id       UUID;
  v_cadence  TEXT;
  v_rule     JSONB;
  v_days     JSONB;
  v_season   TEXT;
  v_start    TEXT;
  v_end      TEXT;
  v_dept     TEXT;
  v_area     TEXT;
  v_note     TEXT;
  v_sort     INTEGER := 1000;
BEGIN
  IF EXISTS (SELECT 1 FROM public.operation_duties WHERE legacy_source = 'crew_task_menu_2026') THEN
    RAISE NOTICE 'crew_task_menu_2026 duties already seeded — skipping.';
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      -- title, category, role_group, schedule, weekdays_csv
      -- ── Golf Ops Assistant ────────────────────────────────────────────────
      ('Dust shelves, displays & ledges','F','golf_operations_assistant','weekly','mon'),
      ('Restock paper towels, soap, TP','F','golf_operations_assistant','weekly','mon,wed,fri'),
      ('Wipe entry doors, handles & rails','F','golf_operations_assistant','daily',''),
      ('Dust ceiling fans, vents & fixtures','F','golf_operations_assistant','monthly',''),
      ('Morning open (unlock, lights, flags)','K','golf_operations_assistant','daily',''),
      ('End-of-day walk & secure','K','golf_operations_assistant','daily',''),
      ('Check first-aid kits & AED','K','golf_operations_assistant','monthly',''),
      -- ── Recreation Aide ───────────────────────────────────────────────────
      ('Empty course trash bins (all holes)','C','recreation_aide','daily',''),
      ('Pick up trash along holes / paths','C','recreation_aide','daily',''),
      ('Clean & refill ball washers','C','recreation_aide','weekly','mon,wed,fri'),
      ('Replace ball-washer towels','C','recreation_aide','weekly','mon'),
      ('Refill water coolers (ice + water)','C','recreation_aide','daily',''),
      ('Clean & sanitize cooler jugs','C','recreation_aide','weekly','mon'),
      ('Service on-course restrooms','C','recreation_aide','weekly','mon'),
      ('Pick up broken tees at tee boxes','C','recreation_aide','weekly','mon,fri'),
      ('Range setup (stations, mats, targets)','D','recreation_aide','daily',''),
      ('Pick range balls','D','recreation_aide','daily',''),
      ('Wash range balls','D','recreation_aide','weekly','mon,wed,fri'),
      ('Clean & stock ball dispenser','D','recreation_aide','daily',''),
      ('Refill range tees & divot mix','D','recreation_aide','daily',''),
      ('Check target greens & flags','D','recreation_aide','weekly','mon'),
      ('Vacuum floors & entry mats','F','recreation_aide','daily',''),
      ('Sweep & mop hard floors','F','recreation_aide','daily',''),
      ('Clean & restock restrooms','F','recreation_aide','daily',''),
      ('Empty trash & recycling','F','recreation_aide','daily',''),
      ('Wipe tables, counters & sills','F','recreation_aide','daily',''),
      ('Clean interior windows & glass','F','recreation_aide','weekly','mon'),
      ('Haul trash to dumpster','F','recreation_aide','daily',''),
      ('Clean & dust TVs and screens','F','recreation_aide','weekly','mon'),
      ('Clean outside windows & storefront glass','F','recreation_aide','weekly','mon'),
      ('Sweep entrance, walkway & patio','F','recreation_aide','daily',''),
      ('Empty exterior trash cans & ashtrays','F','recreation_aide','daily',''),
      ('Clean drinking fountains','F','recreation_aide','weekly','mon'),
      ('Stage carts (line up, keys, GPS)','H','recreation_aide','daily',''),
      ('Stock carts (cards, pencils, towels)','H','recreation_aide','daily',''),
      ('Wash golf carts','H','recreation_aide','asneeded',''),
      ('Charge / fuel cart fleet & log','H','recreation_aide','daily',''),
      ('Check cart batteries / water','H','recreation_aide','weekly','mon,fri'),
      ('Inspect carts for damage & report','H','recreation_aide','weekly','mon,fri'),
      ('Clean & organize cart barn','H','recreation_aide','monthly',''),
      ('Return & plug in carts EOD','H','recreation_aide','daily',''),
      ('Detail & wax a golf cart','M','recreation_aide','weekly','mon,wed,fri'),
      -- ── Maintenance / Grounds ─────────────────────────────────────────────
      ('Change cups & move hole locations','A','maintenance_staff','weekly','mon,wed,fri'),
      ('Mow greens','A','maintenance_staff','daily',''),
      ('Roll greens','A','maintenance_staff','weekly','mon,wed,fri'),
      ('Mow tees & tee surrounds','A','maintenance_staff','weekly','tue,thu'),
      ('Fill divots on tees (sand/seed mix)','A','maintenance_staff','weekly','mon,wed,fri'),
      ('Move & straighten tee markers','A','maintenance_staff','daily',''),
      ('Refresh tee towels & amenities','A','maintenance_staff','weekly','mon,fri'),
      ('Mow fairways','A','maintenance_staff','weekly','mon,wed,fri'),
      ('Walk & fill fairway divots','A','maintenance_staff','weekly','mon,fri'),
      ('Mow approaches & collars','A','maintenance_staff','weekly','tue,thu'),
      ('Mow rough (rotating sections)','A','maintenance_staff','weekly','mon,wed,fri'),
      ('Whip / squeegee dew off greens (AM)','A','maintenance_staff','daily',''),
      ('Hand-water / syringe dry spots','A','maintenance_staff','asneeded',''),
      ('Repair ball marks on greens','A','maintenance_staff','weekly','mon,fri'),
      ('Refill divot-mix bottles on carts','A','maintenance_staff','daily',''),
      ('Empty divot-mix bottles on cart','A','maintenance_staff','weekly','mon'),
      ('Rake bunkers','B','maintenance_staff','weekly','mon,wed,fri'),
      ('Edge bunkers','B','maintenance_staff','monthly',''),
      ('Repair bunker washouts after rain','B','maintenance_staff','asneeded',''),
      ('Remove weeds & debris from bunkers','B','maintenance_staff','weekly','mon'),
      ('Straighten flagsticks & check flags','C','maintenance_staff','daily',''),
      ('Blow / clear cart paths of debris','C','maintenance_staff','weekly','mon,wed,fri'),
      ('Check & reset OB / hazard stakes','C','maintenance_staff','weekly','mon'),
      ('Clean tee, yardage & directional signs','C','maintenance_staff','weekly','mon'),
      ('Clean cart-traffic ropes & signs','C','maintenance_staff','weekly','mon'),
      ('Clear debris from drains, basins, and sprinkler heads','C','maintenance_staff','asneeded',''),
      ('Mow range tee line / rotate strip','D','maintenance_staff','weekly','mon'),
      ('Walk irrigation & log broken heads','E','maintenance_staff','weekly','mon'),
      ('Check pump-station pressure & log','E','maintenance_staff','daily',''),
      ('Adjust irrigation clock for weather','E','maintenance_staff','weekly','mon,wed,fri'),
      ('Hand-water new sod / seed','E','maintenance_staff','asneeded',''),
      ('Check pond levels & water features','E','maintenance_staff','weekly','mon'),
      ('Repair / replace heads as found','E','maintenance_staff','asneeded',''),
      ('Core aerate greens','L','maintenance_staff','seasonal',''),
      ('Core aerate tees','L','maintenance_staff','seasonal',''),
      ('Core aerate fairways','L','maintenance_staff','seasonal',''),
      ('Needle-tine / vent greens','L','maintenance_staff','monthly',''),
      ('Topdress greens','L','maintenance_staff','monthly',''),
      ('Verticut / groom greens','L','maintenance_staff','weekly','mon'),
      ('Roll / drag in topdressing','L','maintenance_staff','weekly','mon'),
      ('Overseed greens & tees','L','maintenance_staff','seasonal',''),
      ('Overseed fairways & rough','L','maintenance_staff','seasonal',''),
      ('Slit-seed / spot-seed worn areas','L','maintenance_staff','weekly','mon'),
      ('Seed divots & bare spots','L','maintenance_staff','weekly','mon'),
      ('Granular fertilizer application','L','maintenance_staff','monthly',''),
      ('Equipment walk-around (fluids, blades)','J','maintenance_staff','daily',''),
      ('Fuel & log mowers / equipment','J','maintenance_staff','daily',''),
      ('Wash down equipment after use','J','maintenance_staff','daily',''),
      ('Sharpen / backlap reels','J','maintenance_staff','monthly',''),
      ('Grease & lube equipment','J','maintenance_staff','weekly','mon'),
      ('Blow out / check air filters','J','maintenance_staff','weekly','mon'),
      ('Refill 2-cycle / mix fuel cans','J','maintenance_staff','weekly','mon'),
      ('Inspect small tools (trimmers, blowers)','J','maintenance_staff','weekly','mon'),
      ('Organize shop & tool board','J','maintenance_staff','weekly','mon'),
      ('Log equipment issues / work orders','J','maintenance_staff','asneeded',''),
      ('Sweep & clean maintenance barn floor','J','maintenance_staff','weekly','mon,fri'),
      ('Wipe down shop benches & surfaces','J','maintenance_staff','weekly','mon'),
      ('Clean & organize the work area','J','maintenance_staff','weekly','sun,sat'),
      ('Clean shop windows','J','maintenance_staff','monthly',''),
      ('Power-wash mowers & equipment','J','maintenance_staff','weekly','mon,fri'),
      ('Empty shop trash & recycling','J','maintenance_staff','asneeded',''),
      ('Wipe & put away tools after use','J','maintenance_staff','daily',''),
      ('Sweep & organize chemical / fertilizer storage','J','maintenance_staff','monthly',''),
      ('Clean course restroom','J','maintenance_staff','weekly','mon,wed,fri'),
      ('Trim & edge around signs, buildings & beds','M','maintenance_staff','weekly','mon'),
      ('Weed & mulch landscape beds','M','maintenance_staff','weekly','mon'),
      ('Paint / touch-up markers, benches & stakes','M','maintenance_staff','monthly',''),
      ('Sharpen hand tools','M','maintenance_staff','monthly',''),
      ('Wash & fold shop towels','M','maintenance_staff','weekly','mon'),
      -- ── Pro Shop Staff ────────────────────────────────────────────────────
      ('Merch walk-through / restock check','G','pro_shop_staff','daily',''),
      ('Straighten & face displays','G','pro_shop_staff','daily',''),
      ('Dust & clean display cases','G','pro_shop_staff','weekly','mon'),
      ('Restock scorecards, pencils, tees','G','pro_shop_staff','daily',''),
      ('Confirm reservations & tee sheet','G','pro_shop_staff','daily',''),
      ('Print daily tee times & pairings','G','pro_shop_staff','daily',''),
      ('Vacuum / tidy pro shop floor','G','pro_shop_staff','daily',''),
      ('Clean & inspect rental club sets','G','pro_shop_staff','weekly','mon,wed,fri'),
      ('Wipe down & organize rental bags','G','pro_shop_staff','asneeded',''),
      ('Clean & organize back stock room','G','pro_shop_staff','weekly','mon'),
      ('Clean counters & point-of-sale area','G','pro_shop_staff','daily',''),
      ('Dust & clean shop TVs / monitors','G','pro_shop_staff','weekly','mon'),
      ('Clean pro shop windows','G','pro_shop_staff','weekly','mon'),
      ('Update pricing & tags','M','pro_shop_staff','weekly','mon'),
      ('Organize stock room','M','pro_shop_staff','weekly','mon'),
      -- ── Restaurant Staff ──────────────────────────────────────────────────
      ('Tidy & wipe down patio furniture','F','restaurant_staff','daily',''),
      ('Hot Dog Monday prep','I','restaurant_staff','weekly','mon'),
      ('Write up US Foods order','I','restaurant_staff','weekly','mon'),
      ('Receive & stock US Foods delivery','I','restaurant_staff','weekly','wed'),
      ('Fryer & equipment cleaning log','I','restaurant_staff','weekly','mon'),
      ('Clean & sanitize kitchen surfaces','I','restaurant_staff','daily',''),
      ('Temp-check coolers / freezers & log','I','restaurant_staff','daily',''),
      ('Restock beverage coolers & drink cart','I','restaurant_staff','daily',''),
      ('Sweep & mop kitchen / dining','I','restaurant_staff','daily',''),
      ('Wipe tables & reset dining area','I','restaurant_staff','daily',''),
      ('Empty restaurant / bar trash','I','restaurant_staff','daily',''),
      ('Stock condiments, napkins, utensils','I','restaurant_staff','daily',''),
      ('Clean & organize refrigerators','I','restaurant_staff','weekly','mon,fri'),
      ('Defrost & clean freezers','I','restaurant_staff','monthly',''),
      ('Deep-clean fryer & change oil','I','restaurant_staff','weekly','mon'),
      ('Clean ice machine','I','restaurant_staff','monthly',''),
      ('Clean coffee & beverage machines','I','restaurant_staff','daily',''),
      ('Clean & sanitize beverage cart','I','restaurant_staff','daily',''),
      ('Sanitize prep tables & cutting boards','I','restaurant_staff','daily',''),
      ('Mop walk-in cooler floor','I','restaurant_staff','weekly','mon,fri'),
      ('Wipe walls, backsplashes & hood','I','restaurant_staff','weekly','mon'),
      ('Clean hood vents & filters','I','restaurant_staff','monthly',''),
      ('Clean grease trap','I','restaurant_staff','monthly',''),
      ('Roll silverware & prep stock','M','restaurant_staff','daily',''),
      ('Deep-clean a kitchen zone (rotation)','M','restaurant_staff','weekly','mon'),
      ('Inventory dry & bar storage','M','restaurant_staff','weekly','mon'),
      ('Wipe & sanitize menus','M','restaurant_staff','weekly','mon,wed,fri'),
      -- ── General Manager ───────────────────────────────────────────────────
      ('Chemical storage & spill-kit check','K','general_manager','monthly',''),
      ('Weather check & lightning protocol','K','general_manager','daily','')
    ) AS t(title, cat, role_group, sched, days_csv)
  LOOP
    -- Department + area follow the role, matching the app's own mapping.
    v_dept := CASE r.role_group
      WHEN 'maintenance_staff'          THEN 'maintenance'
      WHEN 'restaurant_staff'           THEN 'food_and_beverage'
      WHEN 'pro_shop_staff'             THEN 'pro_shop'
      WHEN 'golf_operations_assistant'  THEN 'golf_operations'
      WHEN 'recreation_aide'            THEN 'golf_operations'
      ELSE 'administration'
    END;
    v_area := CASE v_dept
      WHEN 'maintenance'       THEN 'course'
      WHEN 'food_and_beverage' THEN 'restaurant'
      WHEN 'pro_shop'          THEN 'pro_shop'
      WHEN 'golf_operations'   THEN 'golf_operations'
      ELSE 'administration'
    END;

    -- Cadence + recurrence rule + stored weekdays.
    IF r.sched = 'daily' THEN
      v_cadence := 'daily';
      v_days    := '[]'::jsonb;
      v_rule    := '{"cadence":"daily","interval":1,"weekdays":[]}'::jsonb;
      v_note    := NULL;
    ELSIF r.sched = 'weekly' THEN
      v_cadence := 'weekly';
      v_days    := COALESCE(
        (SELECT jsonb_agg(BTRIM(d)) FROM unnest(string_to_array(r.days_csv, ',')) AS d),
        '[]'::jsonb);
      v_rule    := jsonb_build_object('cadence','weekly','interval',1,'weekdays',v_days);
      v_note    := NULL;
    ELSIF r.sched = 'monthly' THEN
      v_cadence := 'monthly';
      v_days    := '[]'::jsonb;
      v_rule    := '{"cadence":"monthly","interval":1,"day_of_month":1}'::jsonb;
      v_note    := NULL;
    ELSIF r.sched = 'seasonal' THEN
      v_cadence := 'annual';
      v_days    := '[]'::jsonb;
      v_rule    := '{"cadence":"annual","interval":1,"day_of_month":1,"months":[9]}'::jsonb;
      v_note    := 'Seasonal turf operation — schedule by hand each season.';
    ELSE  -- asneeded
      v_cadence := 'monthly';
      v_days    := '[]'::jsonb;
      v_rule    := '{"cadence":"monthly","interval":1,"day_of_month":1}'::jsonb;
      v_note    := 'As needed — no fixed schedule; do when required.';
    END IF;

    -- Season window. Seasonal/as-needed are kept dormant (in_season with no
    -- recorded boundaries generates no occurrences). Outdoor course work runs
    -- Apr 1 – Nov 1; facility work is year-round.
    IF r.sched IN ('seasonal','asneeded') THEN
      v_season := 'in_season'; v_start := NULL; v_end := NULL;
    ELSIF r.cat IN ('A','B','C','D','E','L') THEN
      v_season := 'in_season'; v_start := '04-01'; v_end := '11-01';
    ELSE
      v_season := 'year_round'; v_start := NULL; v_end := NULL;
    END IF;

    INSERT INTO public.operation_duties (
      title, area, days, season, department, role_group, cadence, recurrence_rule,
      task_category, priority, active_from, is_active, sort_order,
      seasonal_start_mmdd, seasonal_end_mmdd, legacy_source, note
    ) VALUES (
      r.title, v_area, v_days, v_season, v_dept, r.role_group, v_cadence, v_rule,
      'other', 'normal', CURRENT_DATE, TRUE, v_sort,
      v_start, v_end, 'crew_task_menu_2026', v_note
    ) RETURNING id INTO v_id;

    INSERT INTO public.duty_recurrence_versions (
      duty_id, cadence, recurrence_rule, effective_from, effective_through,
      change_reason, changed_by
    ) VALUES (
      v_id, v_cadence, v_rule, CURRENT_DATE, NULL,
      'Seeded from crew task menu (2026-07-22)', NULL
    );

    v_sort := v_sort + 10;
  END LOOP;

  -- Generate the near-term executable occurrences so today's duties surface on
  -- the command center immediately; the nightly service job keeps the window
  -- topped up beyond this.
  PERFORM public.materialize_duty_occurrences(CURRENT_DATE, CURRENT_DATE + 30);
END $$;

notify pgrst, 'reload schema';
