/**
 * Disposition PACKET builder — merges one NAVCOMPT-2212 (all items, split across
 * sheets past 24) plus, per item, its DD-200 followed by that item's photos, into
 * a single PDF. Mixed dispositions (some lost, some destroyed) are fine: each
 * item carries its own circumstance/category/reason.
 *
 * Reuses the real form generators (they render onto the official rasters) and
 * merges their pages with pdf-lib copyPages, then appends photo pages.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { PAGE_W, PAGE_H } from "@/lib/reports/form-overlay";
import { generateDd2212Report, type Dd2212Data } from "@/lib/reports/dd2212-report";
import { generateDd200Report, type Dd200Data } from "@/lib/reports/dd200-report";
import { DD2212_TABLE } from "@/lib/dd-forms/dd2212-fields";
import { DD200_ORG_ADDRESS } from "@/lib/dd-forms/dd200-fields";
import {
  DD_ACTIVITY_DEFAULT,
  DD200_INITIATOR_NAME,
  ddMonYyyy,
  ymd,
  mdy,
  money,
} from "@/lib/dd-forms/constants";
import { buildDispositionItem } from "@/lib/dd-forms/from-asset";
import type { Fy26Asset } from "@/types/fy26-assets";

export interface PacketItem {
  asset: Fy26Asset;
  circumstance: "lost" | "damaged" | "destroyed";
  category: "organization" | "installation" | "ocie";
  reason: string;
}

export interface PacketResult {
  blob: Blob;
  filename: string;
  photoPages: number;
  skippedPhotos: number;
}

/** Distinct photo URLs for an asset (main + condition angles), in a stable order. */
export function collectAssetPhotos(asset: Fy26Asset): string[] {
  const urls = [
    asset.photo_url,
    asset.condition_photos?.front,
    asset.condition_photos?.back,
    asset.condition_photos?.left,
    asset.condition_photos?.right,
  ].filter((u): u is string => !!u && u.trim().length > 0);
  return Array.from(new Set(urls));
}

function assetCost(asset: Fy26Asset): string {
  return asset.original_value != null ? String(asset.original_value) : "";
}

function packetItemToDd200Data(it: PacketItem): Dd200Data {
  const qty = String(it.asset.qty ?? 1);
  const cost = assetCost(it.asset);
  return {
    dateInitiated: ymd(),
    itemDescription: buildDispositionItem(it.asset),
    quantity: qty,
    unitCost: cost,
    totalCost: money(qty, cost, true),
    circumstance: it.circumstance,
    category: it.category,
    circumstances: it.reason,
    orgAddress: DD200_ORG_ADDRESS,
    typedName: DD200_INITIATOR_NAME,
    dateSigned: mdy(),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function appendPdf(master: PDFDocument, blob: Blob): Promise<void> {
  const src = await PDFDocument.load(await blob.arrayBuffer());
  const pages = await master.copyPages(src, src.getPageIndices());
  pages.forEach((p) => master.addPage(p));
}

function imageKind(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes.length < 3) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  return null;
}

/** Append one full-page photo with a caption. Returns false (skips) on any error. */
async function addPhotoPage(
  master: PDFDocument,
  font: PDFFont,
  url: string,
  caption: string,
): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const kind = imageKind(bytes);
    const img = kind === "png" ? await master.embedPng(bytes) : kind === "jpg" ? await master.embedJpg(bytes) : null;
    if (!img) return false;

    const page = master.addPage([PAGE_W, PAGE_H]);
    const margin = 36;
    const capBaseline = PAGE_H - margin;
    page.drawText(caption, {
      x: margin,
      y: capBaseline,
      size: 10,
      font,
      color: rgb(0, 0, 0),
      maxWidth: PAGE_W - margin * 2,
    });
    const availTop = capBaseline - 16;
    const availH = availTop - margin;
    const availW = PAGE_W - margin * 2;
    const scale = Math.min(availW / img.width, availH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, {
      x: (PAGE_W - w) / 2,
      y: margin + (availH - h) / 2,
      width: w,
      height: h,
    });
    return true;
  } catch {
    return false;
  }
}

export function dispositionPacketFilename(items: PacketItem[]): string {
  const sites = Array.from(new Set(items.map((i) => i.asset.site)));
  const site = sites.length === 1 ? sites[0] : "MULTI";
  return `SITE_${site}_FY26_GLK_DISPOSITION_PACKET_${items.length}_ITEMS.pdf`;
}

/**
 * Build the merged packet: 2212 sheet(s) with every item, then each item's DD-200
 * followed by that item's photos.
 */
export async function buildDispositionPacket(items: PacketItem[]): Promise<PacketResult> {
  if (items.length === 0) throw new Error("Select at least one item for the packet.");

  const master = await PDFDocument.create();
  const font = await master.embedFont(StandardFonts.Helvetica);

  // 2212 sheet(s) — up to 24 rows each.
  const sheets = chunk(items, DD2212_TABLE.maxRows);
  for (let s = 0; s < sheets.length; s++) {
    const data: Dd2212Data = {
      activity: DD_ACTIVITY_DEFAULT,
      date: ddMonYyyy(),
      sheetNo: String(s + 1),
      sheetOf: String(sheets.length),
      items: sheets[s].map((it) => {
        const qty = String(it.asset.qty ?? 1);
        const cost = assetCost(it.asset);
        return {
          description: buildDispositionItem(it.asset),
          units: qty,
          unitCost: cost,
          totalValue: money(qty, cost, false),
          reason: it.reason,
        };
      }),
    };
    const { blob } = await generateDd2212Report(data);
    await appendPdf(master, blob);
  }

  // Per item: DD-200, then its photos.
  let photoPages = 0;
  let skippedPhotos = 0;
  for (const it of items) {
    const { blob } = await generateDd200Report(packetItemToDd200Data(it));
    await appendPdf(master, blob);

    const caption = buildDispositionItem(it.asset);
    for (const url of collectAssetPhotos(it.asset)) {
      const ok = await addPhotoPage(master, font, url, caption);
      if (ok) photoPages++;
      else skippedPhotos++;
    }
  }

  const bytes = await master.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  return { blob, filename: dispositionPacketFilename(items), photoPages, skippedPhotos };
}
