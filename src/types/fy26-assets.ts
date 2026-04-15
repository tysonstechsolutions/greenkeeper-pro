// FY26 Annual Inventory Assets — from SITE 7009 (GL GOLF COURSE) and
// SITE 7010 (GL GOLF COURSE MAINTENANCE) Flexible Asset Listings.

export type Fy26AssetStatus =
  | "unverified"
  | "verified_present"
  | "mia"
  | "disposed";

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
  created_at: string;
  updated_at: string;
}

export const fy26AssetStatusLabels: Record<Fy26AssetStatus, string> = {
  unverified: "Unverified",
  verified_present: "Present",
  mia: "MIA",
  disposed: "Disposed",
};

export const fy26AssetStatusColors: Record<Fy26AssetStatus, string> = {
  unverified: "#6b7280", // gray-500
  verified_present: "#22c55e", // green-500
  mia: "#ef4444", // red-500
  disposed: "#991b1b", // red-800
};

export const fy26AssetSiteLabels: Record<string, string> = {
  "7009": "Golf Course (7009)",
  "7010": "Maintenance (7010)",
};
