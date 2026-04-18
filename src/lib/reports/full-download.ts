/**
 * Full Download — bundles every major report into a single zip archive
 * client-side using jszip (already a dep).
 *
 * Each generator is called sequentially (rather than in parallel) to avoid
 * spiking memory on lower-powered devices. Errors from any one report are
 * logged but don't abort the whole archive — you'll still get the ones that
 * succeeded.
 */
import JSZip from "jszip";
import { generateOrderListReport } from "@/lib/reports/order-list-report";
import { generateEquipmentReport } from "@/lib/reports/equipment-report";
import { generateParkingLotReport } from "@/lib/reports/parking-lot-report";
import { generateClubhouseReport } from "@/lib/reports/clubhouse-report";
import { generateObservationReport } from "@/lib/reports/observation-report";

interface ReportResult {
  name: string;
  filename: string;
  blob?: Blob;
  error?: string;
}

async function tryGenerate(
  name: string,
  fn: () => Promise<{ blob: Blob; filename: string }>,
): Promise<ReportResult> {
  try {
    const { blob, filename } = await fn();
    return { name, filename, blob };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`full-download: ${name} failed —`, msg);
    return { name, filename: `${name}-ERROR.txt`, error: msg };
  }
}

export class FullDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FullDownloadError";
  }
}

export async function generateFullDownloadZip(): Promise<{ blob: Blob; filename: string }> {
  const results = await Promise.all([
    tryGenerate("order-list", () =>
      generateOrderListReport().then((blob) => ({
        blob,
        filename: `vmgc-order-list-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      })),
    ),
    tryGenerate("equipment", () => generateEquipmentReport()),
    tryGenerate("parking-lot", () => generateParkingLotReport()),
    tryGenerate("clubhouse", () => generateClubhouseReport()),
    tryGenerate("observations-holes", () => generateObservationReport({ type: "hole" })),
    tryGenerate("observations-greens", () => generateObservationReport({ type: "green" })),
  ]);

  const successful = results.filter((r) => r.blob);
  if (successful.length === 0) {
    const errors = results
      .filter((r) => r.error)
      .map((r) => `  - ${r.name}: ${r.error}`)
      .join("\n");
    throw new FullDownloadError(
      `All reports failed to generate:\n${errors}`,
    );
  }

  const zip = new JSZip();
  for (const r of results) {
    if (r.blob) {
      zip.file(r.filename, r.blob);
    } else if (r.error) {
      zip.file(
        r.filename,
        `Failed to generate this report:\n\n${r.error}\n\nThis is likely because there's no data yet, or you lack permissions. Check the app UI for details.`,
      );
    }
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const filename = `vmgc-full-report-${new Date().toISOString().slice(0, 10)}.zip`;
  return { blob, filename };
}

export async function downloadFullReport(): Promise<void> {
  const { blob, filename } = await generateFullDownloadZip();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
