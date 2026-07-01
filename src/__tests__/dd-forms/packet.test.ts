import { describe, it, expect } from "vitest";
import {
  collectAssetPhotos,
  dispositionPacketFilename,
  type PacketItem,
} from "@/lib/dd-forms/packet";
import type { Fy26Asset } from "@/types/fy26-assets";

function asset(p: Partial<Fy26Asset>): Fy26Asset {
  return {
    id: p.id ?? "a1",
    site: p.site ?? "7010",
    cost_center: null,
    resp_cost_center: null,
    asset_number: p.asset_number ?? "123",
    sub_number: null,
    license_plate: null,
    description: p.description ?? "Golf cart",
    qty: p.qty ?? 1,
    model_text: null,
    serial_number: null,
    manufacturer: null,
    original_value: p.original_value ?? 1000,
    status: "needs_disposed",
    equipment_id: null,
    verified_at: null,
    verified_by: null,
    notes: null,
    photo_url: p.photo_url ?? null,
    condition_photos: p.condition_photos ?? {},
    barcode_value: null,
    damage_too_extensive: false,
    created_at: "",
    updated_at: "",
  };
}

function item(a: Fy26Asset): PacketItem {
  return { asset: a, circumstance: "destroyed", category: "organization", reason: "x" };
}

describe("collectAssetPhotos", () => {
  it("collects main + condition photos, de-duped, stable order", () => {
    const a = asset({
      photo_url: "main.jpg",
      condition_photos: { front: "f.jpg", back: "b.jpg", left: "main.jpg" },
    });
    expect(collectAssetPhotos(a)).toEqual(["main.jpg", "f.jpg", "b.jpg"]);
  });
  it("is empty when there are no photos", () => {
    expect(collectAssetPhotos(asset({}))).toEqual([]);
  });
});

describe("dispositionPacketFilename", () => {
  it("uses the site when all items share one", () => {
    const items = [item(asset({ site: "7010" })), item(asset({ site: "7010" }))];
    expect(dispositionPacketFilename(items)).toBe("SITE_7010_FY26_GLK_DISPOSITION_PACKET_2_ITEMS.pdf");
  });
  it("uses MULTI for mixed sites", () => {
    const items = [item(asset({ site: "7010" })), item(asset({ site: "7011" }))];
    expect(dispositionPacketFilename(items)).toBe("SITE_MULTI_FY26_GLK_DISPOSITION_PACKET_2_ITEMS.pdf");
  });
});
