// FY26 Annual Inventory Assets — from SITE 7009 (GL GOLF COURSE) and
// SITE 7010 (GL GOLF COURSE MAINTENANCE) Flexible Asset Listings.

import { todayLocal } from "@/lib/utils/date";

export type Fy26AssetStatus =
  | "unverified"
  | "verified_present"
  | "mia"
  | "disposed"
  | "no_asset_tag"
  | "needs_disposed";

export type ConditionPhotoAngle = "front" | "back" | "left" | "right";

export type ConditionPhotos = Partial<Record<ConditionPhotoAngle, string>>;

export interface Fy26Asset {
  id: string;
  site: string;                     // '7009' | '7010'
  cost_center: string | null;
  resp_cost_center: string | null;
  asset_number: string;
  sub_number: string | null;
  license_plate: string | null;
  description: string;
  qty: number;
  model_text: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  original_value: number | null;
  status: Fy26AssetStatus;
  equipment_id: string | null;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  photo_url: string | null;
  condition_photos: ConditionPhotos;
  barcode_value: string | null;
  /** Flag set by the scan wizard when damage is too widespread to document
   *  photo-by-photo. Surfaces as a red "damage unassessed" badge on the
   *  asset list so it's obvious which assets need a manual review. */
  damage_too_extensive: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssetDamageRecord {
  id: string;
  asset_id: string;
  damage_date: string;               // "Prior to April 1 2026" or "2026-04-16"
  description: string;
  photos: string[];
  reported_by: string | null;
  created_at: string;
  updated_at: string;
}

export const CONDITION_PHOTO_LABELS: Record<ConditionPhotoAngle, string> = {
  front: "Front",
  back: "Back",
  left: "Left Side",
  right: "Right Side",
};

// Computed at call time so "Today" is always today's local date — using
// a frozen module-load value would bake yesterday's date into the bundle.
export function getDamageDatePresets() {
  return [
    { label: "Prior to April 1, 2026", value: "Prior to April 1 2026" },
    { label: "Today", value: todayLocal() },
  ];
}

export const fy26AssetStatusLabels: Record<Fy26AssetStatus, string> = {
  unverified: "Unverified",
  verified_present: "Present",
  mia: "Missing",
  disposed: "Disposed",
  no_asset_tag: "No Asset Tag",
  needs_disposed: "Needs Disposed",
};

export const fy26AssetStatusColors: Record<Fy26AssetStatus, string> = {
  unverified: "#6b7280", // gray-500
  verified_present: "#22c55e", // green-500
  mia: "#ef4444", // red-500
  disposed: "#991b1b", // red-800
  no_asset_tag: "#f59e0b", // amber-500 — visible but present, needs action
  needs_disposed: "#ea580c", // orange-600 — pending disposal paperwork
};

export const fy26AssetSiteLabels: Record<string, string> = {
  "7009": "Golf Course (7009)",
  "7010": "Maintenance (7010)",
};
