// Shared constants for hole observation system
// Used by both client components and API routes

import type { HoleIssueType } from "@/types/database";

export const issueTypeLabels: Record<HoleIssueType, string> = {
  fungus_disease: "Fungus / Disease",
  dry_spot: "Dry Spot",
  wet_area: "Wet Area",
  bare_spot: "Bare Spot",
  weed_pressure: "Weed Pressure",
  pest_damage: "Pest Damage",
  mechanical_damage: "Mechanical Damage",
  drainage: "Drainage Issue",
  bunker_issue: "Bunker Issue",
  tree_issue: "Tree Issue",
  irrigation_issue: "Irrigation Issue",
  turf_thin: "Thin Turf",
  algae: "Algae",
  frost_damage: "Frost Damage",
  other: "Other",
};

export const issueTypeIcons: Record<HoleIssueType, string> = {
  fungus_disease: "🍄",
  dry_spot: "☀️",
  wet_area: "💧",
  bare_spot: "🟫",
  weed_pressure: "🌿",
  pest_damage: "🐛",
  mechanical_damage: "⚙️",
  drainage: "🌊",
  bunker_issue: "⛳",
  tree_issue: "🌳",
  irrigation_issue: "💦",
  turf_thin: "🌱",
  algae: "🟢",
  frost_damage: "❄️",
  other: "📍",
};

/** Default descriptions auto-filled when an issue type is selected. User can edit freely. */
export const issueTypeDescriptions: Record<HoleIssueType, string> = {
  fungus_disease: "Possible fungal infection — discolored or damaged turf observed.",
  dry_spot: "Dry area identified — turf showing signs of moisture stress and discoloration.",
  wet_area: "Persistently wet/saturated area — standing water or soggy turf conditions.",
  bare_spot: "Bare or thin area — exposed soil with little to no turf coverage.",
  weed_pressure: "Weed encroachment identified — undesirable plant material present in turf.",
  pest_damage: "Possible pest damage — irregular turf damage patterns observed.",
  mechanical_damage: "Mechanical damage to turf — caused by mower, equipment, or vehicle traffic.",
  drainage: "Drainage issue — water not flowing properly, pooling, or erosion present.",
  bunker_issue: "Bunker maintenance needed — sand contamination, washout, or edge repair required.",
  tree_issue: "Tree-related issue — dead limbs, root damage, or canopy concerns.",
  irrigation_issue: "Irrigation problem — head malfunction, coverage gap, or leak detected.",
  turf_thin: "Thin turf area — reduced density, needs overseeding or recovery time.",
  algae: "Algae growth present — green/black film on turf surface, typically in wet areas.",
  frost_damage: "Frost damage observed — turf discoloration or cell damage from freezing.",
  other: "",
};

/** Default fix instructions auto-filled when an issue type is selected. User can edit freely. */
export const issueTypeFixTemplates: Record<HoleIssueType, string> = {
  fungus_disease: "1. Identify disease type (dollar spot, brown patch, etc.)\n2. Apply appropriate fungicide per label rates\n3. Reduce leaf wetness — adjust irrigation timing\n4. Monitor area daily for 7-10 days",
  dry_spot: "1. Check irrigation head coverage and rotation\n2. Hand-water affected area immediately\n3. Probe soil to confirm dry conditions at root zone\n4. Apply wetting agent if hydrophobic\n5. Adjust run times or add head if coverage gap",
  wet_area: "1. Check for irrigation leaks or broken heads\n2. Inspect drainage — clear any blocked drains\n3. Aerate area to improve infiltration\n4. Reduce irrigation run time for this zone\n5. Monitor after next rain event",
  bare_spot: "1. Determine cause (traffic, disease, scalping, etc.)\n2. Loosen soil and apply seed or sod\n3. Topdress lightly with sand/soil mix\n4. Keep moist until establishment\n5. Rope off area if high-traffic",
  weed_pressure: "1. Identify weed species\n2. Select appropriate herbicide (pre or post-emergent)\n3. Apply per label rates in calm conditions\n4. Hand-pull isolated patches if small area\n5. Overseed thin areas to crowd out weeds",
  pest_damage: "1. Identify pest (grubs, armyworms, mole crickets, etc.)\n2. Check population threshold — soap flush test\n3. Apply appropriate insecticide per label\n4. Water in if systemic product\n5. Monitor for 5-7 days after application",
  mechanical_damage: "1. Assess extent of damage\n2. Repair divots — fill with sand/seed mix\n3. Adjust mower height or pattern if scalping\n4. Rope off area if needed for recovery\n5. Address root cause (operator training, equipment adjustment)",
  drainage: "1. Identify water flow pattern\n2. Clear any blocked catch basins or drains\n3. Check pipe integrity for breaks or clogs\n4. Consider adding French drain if chronic\n5. Re-grade surface to direct water flow",
  bunker_issue: "1. Assess sand depth and contamination level\n2. Rebuild edges if eroded\n3. Add fresh sand if below 4-inch depth\n4. Check drain function at bunker floor\n5. Rake and finish to playable condition",
  tree_issue: "1. Assess tree health and safety risk\n2. Remove dead or hanging limbs\n3. Treat root damage if exposed\n4. Consider canopy thinning for turf health\n5. Schedule arborist if major work needed",
  irrigation_issue: "1. Identify specific head or zone affected\n2. Check for clogged nozzles or broken risers\n3. Replace damaged components\n4. Run manual cycle to verify fix\n5. Adjust arc and radius for proper coverage",
  turf_thin: "1. Determine cause of thinning\n2. Core aerate to reduce compaction\n3. Overseed with appropriate blend\n4. Topdress with sand/compost mix\n5. Reduce traffic and mowing frequency until recovery",
  algae: "1. Improve drainage in affected area\n2. Reduce irrigation frequency\n3. Apply appropriate algaecide\n4. Aerate to improve air circulation at surface\n5. Address shade issues if applicable",
  frost_damage: "1. Keep traffic off affected areas until thaw\n2. Do not mow until turf has fully recovered\n3. Delay irrigation until ground thaws\n4. Apply light fertilizer once growth resumes\n5. Monitor for secondary disease entry",
  other: "",
};
