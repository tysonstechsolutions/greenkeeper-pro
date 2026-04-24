// Untracked Assets — facility-owned items that are NOT on the MWRMA
// FY26 property inventory. See supabase/migrations/20260424_untracked_assets.sql.

export type UntrackedAssetCategory =
  | "printer"
  | "tv"
  | "computer"
  | "furniture"
  | "appliance"
  | "mower"
  | "trimmer"
  | "tool"
  | "vehicle"
  | "office"
  | "other";

export interface UntrackedAsset {
  id: string;
  name: string;
  category: UntrackedAssetCategory;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
  notes: string | null;
  photos: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const untrackedAssetCategoryLabels: Record<UntrackedAssetCategory, string> = {
  printer: "Printer",
  tv: "TV / Monitor",
  computer: "Computer",
  furniture: "Furniture",
  appliance: "Appliance",
  mower: "Mower",
  trimmer: "Trimmer",
  tool: "Tool",
  vehicle: "Vehicle",
  office: "Office Equipment",
  other: "Other",
};

export const UNTRACKED_ASSET_CATEGORIES: UntrackedAssetCategory[] = [
  "mower",
  "trimmer",
  "tool",
  "vehicle",
  "printer",
  "computer",
  "tv",
  "office",
  "furniture",
  "appliance",
  "other",
];
