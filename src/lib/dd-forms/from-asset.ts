/**
 * One-click disposition paperwork from an FY26 asset: builds the DD-200 and
 * NAVCOMPT-2212 data straight from the asset record, generates both real forms,
 * saves each to the Documents store, and downloads/shares them to the device.
 * Used by the "Create both forms" button on a needs-disposed asset.
 */
import type { Fy26Asset } from "@/types/fy26-assets";
import { generateDd200Report, dd200Filename, type Dd200Data } from "@/lib/reports/dd200-report";
import { generateDd2212Report, dd2212Filename, type Dd2212Data } from "@/lib/reports/dd2212-report";
import { DD200_ORG_ADDRESS } from "@/lib/dd-forms/dd200-fields";
import { DD_ACTIVITY_DEFAULT, ddMonYyyy, ymd, mdy, money } from "@/lib/dd-forms/constants";
import { saveCreatedDocument } from "@/lib/documents/saved-documents";
import { saveBlobToDevice } from "@/lib/utils/download-blob";

/** "GOLF CART / 2000 — E-Z-GO TXT-GAS — SN 1306223 — Asset 17306732" */
export function buildDispositionItem(asset: Fy26Asset): string {
  return [
    asset.description,
    [asset.manufacturer, asset.model_text].filter(Boolean).join(" ").trim(),
    asset.serial_number ? `SN ${asset.serial_number}` : "",
    `Asset ${asset.asset_number}`,
  ]
    .filter(Boolean)
    .join(" — ");
}

function dispositionReason(asset: Fy26Asset): string {
  return asset.notes?.trim() || "Beyond economical repair";
}

export function assetToDd2212Data(asset: Fy26Asset): Dd2212Data {
  const qty = String(asset.qty ?? 1);
  const cost = asset.original_value != null ? String(asset.original_value) : "";
  return {
    activity: DD_ACTIVITY_DEFAULT,
    date: ddMonYyyy(),
    sheetNo: "1",
    sheetOf: "1",
    items: [
      {
        description: buildDispositionItem(asset),
        units: qty,
        unitCost: cost,
        totalValue: money(qty, cost, false),
        reason: dispositionReason(asset),
      },
    ],
  };
}

export function assetToDd200Data(asset: Fy26Asset): Dd200Data {
  const qty = String(asset.qty ?? 1);
  const cost = asset.original_value != null ? String(asset.original_value) : "";
  return {
    dateInitiated: ymd(),
    itemDescription: buildDispositionItem(asset),
    quantity: qty,
    unitCost: cost,
    totalCost: money(qty, cost, true),
    // A beyond-repair disposal of organization property: sensible defaults the
    // user can change by opening the filler instead.
    circumstance: "destroyed",
    category: "organization",
    circumstances: dispositionReason(asset),
    orgAddress: DD200_ORG_ADDRESS,
    dateSigned: mdy(),
  };
}

export interface DispositionResult {
  filenames: string[];
}

/**
 * Generate both disposition forms for an asset, save each to Documents, and
 * download/share them. Returns the file names produced.
 */
export async function createDispositionForms(asset: Fy26Asset): Promise<DispositionResult> {
  const site = asset.site;

  const fn2212 = dd2212Filename(site, asset.description);
  const { blob: b2212 } = await generateDd2212Report(assetToDd2212Data(asset), fn2212);

  const fn200 = dd200Filename(site, asset.description);
  const { blob: b200 } = await generateDd200Report(assetToDd200Data(asset), fn200);

  // Save both to the Documents store (best-effort — never throws).
  await saveCreatedDocument({
    docType: "dd2212",
    title: `NAVCOMPT 2212 — ${asset.description} (Site ${site})`,
    blob: b2212,
    filename: fn2212,
    meta: { site, asset_id: asset.id, source: "asset-disposal" },
  });
  await saveCreatedDocument({
    docType: "dd200",
    title: `DD-200 — ${asset.description} (Site ${site})`,
    blob: b200,
    filename: fn200,
    meta: { site, asset_id: asset.id, source: "asset-disposal" },
  });

  // Hand both to the device (download on web, share sheet on native).
  await saveBlobToDevice({ blob: b2212, filename: fn2212, shareTitle: fn2212 });
  await saveBlobToDevice({ blob: b200, filename: fn200, shareTitle: fn200 });

  return { filenames: [fn2212, fn200] };
}
