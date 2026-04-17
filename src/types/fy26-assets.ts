// FY26 Annual Inventory Assets — from SITE 7009 (GL GOLF COURSE) and
// SITE 7010 (GL GOLF COURSE MAINTENANCE) Flexible Asset Listings.

export type Fy26AssetStatus =
  | "unverified"
  | "verified_present"
  | "mia"
  | "disposed"
  | "no_asset_tag";

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

export const DAMAGE_DATE_PRESETS = [
  { label: "Prior to April 1, 2026", value: "Prior to April 1 2026" },
  { label: "Today", value: new Date().toISOString().slice(0, 10) },
];

export const fy26AssetStatusLabels: Record<Fy26AssetStatus, string> = {
  unverified: "Unverified",
  verified_present: "Present",
  mia: "MIA",
  disposed: "Disposed",
  no_asset_tag: "No Asset Tag",
};

export const fy26AssetStatusColors: Record<Fy26AssetStatus, string> = {
  unverified: "#6b7280", // gray-500
  verified_present: "#22c55e", // green-500
  mia: "#ef4444", // red-500
  disposed: "#991b1b", // red-800
  no_asset_tag: "#f59e0b", // amber-500 — visible but present, needs action
};

export const fy26AssetSiteLabels: Record<string, string> = {
  "7009": "Golf Course (7009)",
  "7010": "Maintenance (7010)",
};
