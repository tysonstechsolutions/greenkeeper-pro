-- ============================================================
-- VMGC Strategic Action Plan - Seed Data for Tasks/Checklists
-- Seeds turf improvement tasks (Spring 2026) and marketing tasks (Summer 2026)
-- ============================================================

-- ============================================================
-- SECTION 1: TURF IMPROVEMENT - PUTTING GREENS
-- Timeline: April 1 - May 15, 2026 | 400 man-hours
-- ============================================================

-- Task 1: Greens 10-18 Scarification & Overseeding
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Greens 10-18: Scarify, Overseed & Top Dress',
  'Phase 1 of putting green renovation. Scarify, overseed with combination bent grasses, and top dress greens 10-18 with USGA putting green grade sand. Roll for soil/seed contact and begin germination watering.',
  'greens',
  'critical',
  'pending',
  '2026-04-14',
  '[
    {"id": "g1-1", "text": "Scarify greens 10-18 to remove thatch and prepare seedbed", "checked": false},
    {"id": "g1-2", "text": "Overseed greens 10-18 with combination Bent Grasses", "checked": false},
    {"id": "g1-3", "text": "Top dress greens 10-18 with USGA putting green grade sand", "checked": false},
    {"id": "g1-4", "text": "Roll greens 10-18 to ensure soil/seed contact", "checked": false},
    {"id": "g1-5", "text": "Begin germination watering schedule - manual water as needed (10-20 days)", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Turf Improvement Phase 1. Estimated 200 man-hours for this phase. Supplies needed: Seed, Sand, Dirt, Top dresser.',
  NOW()
);

-- Task 2: Greens 1-9 Core Aeration, Verti-cut & Overseeding
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Greens 1-9 & Practice Green: Aerate, Verti-cut & Overseed',
  'Phase 2 of putting green renovation. Core aerate greens 1-9 and practice green, verti-cut front, overseed with combination bent grasses, and top dress.',
  'greens',
  'critical',
  'pending',
  '2026-04-28',
  '[
    {"id": "g2-1", "text": "Core aerate greens 1-9 and practice green", "checked": false},
    {"id": "g2-2", "text": "Verti-cut front of greens 1-9 and practice green", "checked": false},
    {"id": "g2-3", "text": "Overseed greens 1-9 and practice green with combination Bent Grasses", "checked": false},
    {"id": "g2-4", "text": "Top dress greens 1-9 and practice green", "checked": false},
    {"id": "g2-5", "text": "Manual watering as needed for germination", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Turf Improvement Phase 2. Estimated 200 man-hours for this phase. Supplies needed: Seed, Sand, Dirt, Top dresser.',
  NOW()
);

-- Task 3: All Greens Fungicide & Fertilizer Application
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'All Greens (1-18): Fungicide Spray & Fertilization',
  'Comprehensive spraying plan for all 18 greens plus practice green. Remediate and control fungus, then fertilize to promote healthy bent grass growth.',
  'chemical',
  'critical',
  'pending',
  '2026-04-21',
  '[
    {"id": "g3-1", "text": "Inspect all 18 greens for fungus signs (dollar spot, brown patch, snow mold)", "checked": false},
    {"id": "g3-2", "text": "Prepare fungicide mix per comprehensive spraying plan", "checked": false},
    {"id": "g3-3", "text": "Spray greens 1-9 for fungus", "checked": false},
    {"id": "g3-4", "text": "Spray greens 10-18 for fungus", "checked": false},
    {"id": "g3-5", "text": "Spray practice green for fungus", "checked": false},
    {"id": "g3-6", "text": "Fertilize greens 1-18 and practice green", "checked": false},
    {"id": "g3-7", "text": "Log all chemical applications in GreenKeeper Pro", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Fungus remediation is priority #1 for greens recovery. Follow comprehensive spraying plan schedule.',
  NOW()
);

-- Task 4: Greens Ongoing Maintenance - Firmness & Roll Quality
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'All Greens: Improve Firmness and Roll Quality',
  'Ongoing maintenance to improve putting surface firmness and ball roll consistency through regular top dressing, cutting height adjustments, and rolling.',
  'greens',
  'high',
  'pending',
  '2026-05-15',
  '[
    {"id": "g4-1", "text": "Establish mowing schedule - lower cutting height gradually over 2 weeks", "checked": false},
    {"id": "g4-2", "text": "Light top dress all greens with fine sand", "checked": false},
    {"id": "g4-3", "text": "Roll all greens to improve ball roll consistency", "checked": false},
    {"id": "g4-4", "text": "Test green speeds with stimpmeter - record baseline readings", "checked": false},
    {"id": "g4-5", "text": "Adjust irrigation to promote firmness (avoid overwatering)", "checked": false},
    {"id": "g4-6", "text": "Monitor thatch removal progress from aeration/scarification", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Target consistent green speeds across all 18 holes. Document stimpmeter readings weekly.',
  NOW()
);

-- ============================================================
-- SECTION 2: TURF IMPROVEMENT - FAIRWAYS & APPROACHES
-- Timeline: April 1 - May 15, 2026 | 200 man-hours
-- ============================================================

-- Task 5: Fairways Bare Spot Renovation
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Fairways: Scarify & Overseed Bare Spots',
  'Identify and renovate all bare spots on 14 fairways. Scarify, overseed with Fine Fescue/Bluegrass mixture, top dress, and rope off larger areas for recovery.',
  'landscaping',
  'high',
  'pending',
  '2026-04-14',
  '[
    {"id": "f1-1", "text": "Survey all 14 fairways - map and document bare spots", "checked": false},
    {"id": "f1-2", "text": "Scarify all identified bare spots", "checked": false},
    {"id": "f1-3", "text": "Overseed bare spots with Fine Fescue/Bluegrass mixture", "checked": false},
    {"id": "f1-4", "text": "Top dress bare spots with sand/soil mix", "checked": false},
    {"id": "f1-5", "text": "Set up manual watering schedule for seeded areas", "checked": false},
    {"id": "f1-6", "text": "Rope off larger renovation areas with stakes", "checked": false},
    {"id": "f1-7", "text": "Fertilize new growth once germinated", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Fairway renovation. Supplies needed: Sand, Soil, Seed, Rope, Stakes. 200 man-hours estimated for all fairway work.',
  NOW()
);

-- Task 6: Fairways Weed & Pest Control
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Fairways: Herbicide & Insecticide Treatment',
  'Control weeds, unwanted grass, and grubs/insect larvae across all 14 fairways and 18 approaches. Apply pre-emergent and post-emergent herbicides.',
  'chemical',
  'high',
  'pending',
  '2026-04-21',
  '[
    {"id": "f2-1", "text": "Scout fairways for weed species identification", "checked": false},
    {"id": "f2-2", "text": "Apply pre-emergent herbicide to all fairways", "checked": false},
    {"id": "f2-3", "text": "Apply post-emergent herbicide to target broadleaf weeds", "checked": false},
    {"id": "f2-4", "text": "Promote bluegrass growth to crowd out unwanted grass species", "checked": false},
    {"id": "f2-5", "text": "Scout for grub and insect larvae damage", "checked": false},
    {"id": "f2-6", "text": "Apply insecticide per spraying plan for grub control", "checked": false},
    {"id": "f2-7", "text": "Log all chemical applications in GreenKeeper Pro", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Weed/pest control for fairways. Follow comprehensive spraying plan schedule.',
  NOW()
);

-- Task 7: Fairways Surface Leveling & Aeration
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Fairways: Surface Leveling & Aeration Program',
  'Improve fairway surface leveling through top dressing and scalping. Strengthen root systems with solid tine and core aeration.',
  'landscaping',
  'normal',
  'pending',
  '2026-05-01',
  '[
    {"id": "f3-1", "text": "Identify worst low spots and uneven areas on all fairways", "checked": false},
    {"id": "f3-2", "text": "Top dress low areas to improve leveling", "checked": false},
    {"id": "f3-3", "text": "Scalp high spots to improve surface consistency", "checked": false},
    {"id": "f3-4", "text": "Solid tine aerate all 14 fairways", "checked": false},
    {"id": "f3-5", "text": "Core aerate compacted areas on fairways", "checked": false},
    {"id": "f3-6", "text": "Clean up cores and top dress aeration holes", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Aeration improves root depth and water penetration. Schedule around play to minimize disruption.',
  NOW()
);

-- ============================================================
-- SECTION 3: TURF IMPROVEMENT - TEE BOXES
-- Timeline: May 15 - June 30, 2026 | 80 man-hours
-- ============================================================

-- Task 8: Tee Box Renovation
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Tee Boxes (All 18): Scarify, Overseed & Top Dress',
  'Renovate all 18 tee boxes. Scarify, overseed with Perennial Rye and Bluegrass combination, top dress, and establish watering schedule.',
  'landscaping',
  'high',
  'pending',
  '2026-05-18',
  '[
    {"id": "t1-1", "text": "Scarify all 18 tee boxes", "checked": false},
    {"id": "t1-2", "text": "Overseed tee boxes with combination Perennial Rye and Blue Grass", "checked": false},
    {"id": "t1-3", "text": "Top dress all tee boxes with sand/dirt mix", "checked": false},
    {"id": "t1-4", "text": "Manual watering as needed for germination", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Tee Box renovation. Supplies needed: Sand, Seed, Dirt. 80 man-hours estimated.',
  NOW()
);

-- Task 9: Tee Box Weed Control & Leveling
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Tee Boxes: Weed Control, Leveling & Aeration',
  'Control weeds and unwanted grass on all tee boxes. Improve surface leveling and strengthen root systems with aeration.',
  'chemical',
  'normal',
  'pending',
  '2026-06-01',
  '[
    {"id": "t2-1", "text": "Spray tee boxes for weed control (promote bluegrass)", "checked": false},
    {"id": "t2-2", "text": "Identify and treat unwanted grass species on tees", "checked": false},
    {"id": "t2-3", "text": "Top dress uneven areas on tee boxes", "checked": false},
    {"id": "t2-4", "text": "Scalp high spots for improved leveling", "checked": false},
    {"id": "t2-5", "text": "Solid tine aerate all tee boxes", "checked": false},
    {"id": "t2-6", "text": "Core aerate compacted tee box areas", "checked": false},
    {"id": "t2-7", "text": "Log all chemical applications in GreenKeeper Pro", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Tee box weed control and leveling. Schedule spraying when wind is calm.',
  NOW()
);

-- ============================================================
-- SECTION 4: TURF IMPROVEMENT - DRIVING RANGE
-- Timeline: May 15 - June 30, 2026 | 80 man-hours
-- ============================================================

-- Task 10: Driving Range Hitting Area Renovation
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Driving Range: Hitting Area Full Renovation',
  'Renovate driving range hitting area. Scarify, overseed with Perennial Rye Grass, top dress with sand/dirt mixture, and establish watering.',
  'landscaping',
  'high',
  'pending',
  '2026-05-18',
  '[
    {"id": "dr1-1", "text": "Scarify entire driving range hitting area", "checked": false},
    {"id": "dr1-2", "text": "Overseed hitting area with Perennial Rye Grass", "checked": false},
    {"id": "dr1-3", "text": "Top dress hitting area with sand and dirt mixture", "checked": false},
    {"id": "dr1-4", "text": "Set up manual watering schedule for germination", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Range renovation. Supplies needed: Sand, Seed, Dirt. 80 man-hours estimated.',
  NOW()
);

-- Task 11: Driving Range Weed Control, Leveling & Aeration
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Driving Range: Weed Control, Leveling & Aeration',
  'Control weeds on range, improve surface leveling, and strengthen root system through aeration.',
  'chemical',
  'normal',
  'pending',
  '2026-06-01',
  '[
    {"id": "dr2-1", "text": "Spray driving range for weed and unwanted grass control", "checked": false},
    {"id": "dr2-2", "text": "Top dress low/uneven areas on range", "checked": false},
    {"id": "dr2-3", "text": "Scalp high spots for improved surface leveling", "checked": false},
    {"id": "dr2-4", "text": "Solid tine aerate entire hitting area", "checked": false},
    {"id": "dr2-5", "text": "Core aerate heavily compacted zones", "checked": false},
    {"id": "dr2-6", "text": "Log all chemical applications in GreenKeeper Pro", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Range maintenance. May need to close sections during aeration.',
  NOW()
);

-- ============================================================
-- SECTION 5: MARKETING IMPROVEMENT
-- Timeline: Summer 2026 (June - August)
-- ============================================================

-- Task 12: Website Development
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Marketing: Develop Stand-Alone VMGC Website',
  'Design and launch a stand-alone website for Veterans Memorial Golf Course to improve public visibility, online booking, and marketing reach.',
  'admin',
  'high',
  'pending',
  '2026-06-30',
  '[
    {"id": "m1-1", "text": "Define website requirements and key pages (home, rates, tee times, about, contact)", "checked": false},
    {"id": "m1-2", "text": "Select domain name and hosting provider", "checked": false},
    {"id": "m1-3", "text": "Design website layout and branding", "checked": false},
    {"id": "m1-4", "text": "Build and populate all pages with content and photos", "checked": false},
    {"id": "m1-5", "text": "Integrate online tee time booking system", "checked": false},
    {"id": "m1-6", "text": "Set up Google Business Profile and local SEO", "checked": false},
    {"id": "m1-7", "text": "Launch website and verify all links and forms work", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Marketing Phase. Stand-alone website is critical for public-facing marketing.',
  NOW()
);

-- Task 13: Social Media Refresh
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Marketing: Refresh & Broaden Social Media Reach',
  'Revamp social media presence across platforms. Create consistent posting schedule and engage with local community.',
  'admin',
  'high',
  'pending',
  '2026-06-15',
  '[
    {"id": "m2-1", "text": "Audit current social media accounts (Facebook, Instagram, etc.)", "checked": false},
    {"id": "m2-2", "text": "Update profile photos, banners, and bios with current branding", "checked": false},
    {"id": "m2-3", "text": "Create content calendar with weekly posting schedule", "checked": false},
    {"id": "m2-4", "text": "Take professional photos of course conditions, events, and facilities", "checked": false},
    {"id": "m2-5", "text": "Set up accounts on any missing platforms (Instagram, TikTok, Nextdoor)", "checked": false},
    {"id": "m2-6", "text": "Begin regular posting - minimum 3x per week", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Social media is free marketing. Showcase turf improvements as they happen.',
  NOW()
);

-- Task 14: Specials & Promotions
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Marketing: Develop Key Specials for Slow Periods',
  'Create targeted specials and promotions to increase play during traditionally slower periods (weekday mornings, late afternoon, off-season).',
  'admin',
  'normal',
  'pending',
  '2026-07-01',
  '[
    {"id": "m3-1", "text": "Analyze tee time data to identify slowest periods", "checked": false},
    {"id": "m3-2", "text": "Design twilight rate specials for afternoon play", "checked": false},
    {"id": "m3-3", "text": "Create weekday morning military/veteran discount program", "checked": false},
    {"id": "m3-4", "text": "Develop group/corporate outing packages", "checked": false},
    {"id": "m3-5", "text": "Create loyalty/punch card program for repeat players", "checked": false},
    {"id": "m3-6", "text": "Launch specials via website, social media, and email", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Focus on filling tee sheet gaps. Track revenue impact of each promotion.',
  NOW()
);

-- Task 15: Online Advertising & Email Marketing
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Marketing: Online Advertising & Email Campaigns',
  'Set up online advertising for goods and services. Purchase marketing mailing list and email list. Launch email marketing campaigns.',
  'admin',
  'normal',
  'pending',
  '2026-07-15',
  '[
    {"id": "m4-1", "text": "Research and purchase marketing mailing list for local area", "checked": false},
    {"id": "m4-2", "text": "Purchase targeted email list for golfers in region", "checked": false},
    {"id": "m4-3", "text": "Set up email marketing platform (Mailchimp, Constant Contact, etc.)", "checked": false},
    {"id": "m4-4", "text": "Design email templates with VMGC branding", "checked": false},
    {"id": "m4-5", "text": "Create first email campaign - Grand Re-Introduction to VMGC", "checked": false},
    {"id": "m4-6", "text": "Set up Google Ads campaign for local golf searches", "checked": false},
    {"id": "m4-7", "text": "Advertise pro shop goods and services online", "checked": false},
    {"id": "m4-8", "text": "Track open rates, click-throughs, and conversions", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Budget needed for mailing list purchase and ad spend. Track ROI on all campaigns.',
  NOW()
);

-- Task 16: Community Collaboration
INSERT INTO tasks (
  id, title, description, category, priority, status,
  due_date, checklist, notes, created_at
) VALUES (
  gen_random_uuid(),
  'Marketing: Community Collaboration Initiatives',
  'Build relationships with local community organizations, businesses, and groups. Create collaborative events and partnerships to increase course awareness and play.',
  'admin',
  'normal',
  'pending',
  '2026-07-15',
  '[
    {"id": "m5-1", "text": "Identify local businesses for cross-promotion partnerships", "checked": false},
    {"id": "m5-2", "text": "Reach out to local schools for junior golf programs", "checked": false},
    {"id": "m5-3", "text": "Connect with veteran organizations for special events", "checked": false},
    {"id": "m5-4", "text": "Plan community charity tournament or fundraiser", "checked": false},
    {"id": "m5-5", "text": "Partner with local restaurants/bars for golf league nights", "checked": false},
    {"id": "m5-6", "text": "Explore partnerships with Naval Station community services", "checked": false}
  ]'::jsonb,
  'Part of VMGC Strategic Action Plan - Community engagement drives word-of-mouth marketing. Leverage military community connection.',
  NOW()
);

-- ============================================================
-- VERIFICATION: Count seeded tasks
-- ============================================================
SELECT
  category,
  COUNT(*) as task_count,
  COUNT(*) FILTER (WHERE priority = 'critical') as critical,
  COUNT(*) FILTER (WHERE priority = 'high') as high,
  COUNT(*) FILTER (WHERE priority = 'normal') as normal
FROM tasks
WHERE notes LIKE '%VMGC Strategic Action Plan%'
GROUP BY category
ORDER BY category;
