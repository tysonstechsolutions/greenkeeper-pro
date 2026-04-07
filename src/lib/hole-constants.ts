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
