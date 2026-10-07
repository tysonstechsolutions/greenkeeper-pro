/**
 * Open inventory count spreadsheets (.xlsx / .xls) and RecTrac Inventory
 * Valuation Report PDFs (or a .zip of them) and read each into a valuation.
 * SheetJS and pdf.js are loaded only when needed.
 */
import JSZip from "jszip";
import { parseValuationReport, parseValuationWorkbook, pickValuations, type Rows, type ValuationFile } from "./valuation";

export interface InputFile {
  name: string;
  data: Uint8Array;
}

const isSheet = (n: string) => /\.(xlsx|xlsm|xls)$/i.test(n) && !n.startsWith("~$");
const isPdf = (n: string) => /\.pdf$/i.test(n);
const readable = (n: string) => isSheet(n) || isPdf(n);

async function expand(files: InputFile[]): Promise<{ sheets: InputFile[]; other: string[] }> {
  const sheets: InputFile[] = [];
  const other: string[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const zip = await JSZip.loadAsync(f.data);
      for (const entry of Object.values(zip.files)) {
        const base = entry.name.split("/").pop() ?? entry.name;
        if (entry.dir || entry.name.startsWith("__MACOSX/") || base.startsWith("._")) continue;
        if (readable(base)) sheets.push({ name: base, data: await entry.async("uint8array") });
        else other.push(base);
      }
    } else if (readable(f.name)) {
      sheets.push(f);
    } else {
      other.push(f.name);
    }
  }
  return { sheets, other };
}

export interface InventoryReadResult {
  kept: ValuationFile[];
  setAside: { fileName: string; reason: string }[];
  /** Files that weren't a count sheet or valuation report (other PDFs, photos, other spreadsheets). */
  unreadable: string[];
}

export async function readInventoryFiles(files: InputFile[]): Promise<InventoryReadResult> {
  const { sheets, other } = await expand(files);
  const found: ValuationFile[] = [];
  const unreadable = [...other];
  for (const f of sheets) {
    try {
      if (isPdf(f.name)) {
        const { pdfTextLines } = await import("@/lib/pdf/text-lines");
        const parsed = parseValuationReport(await pdfTextLines(f.data));
        if (parsed) found.push({ fileName: f.name, valuation: parsed });
        else unreadable.push(f.name);
        continue;
      }
      const XLSX = await import("xlsx");
      const wb = XLSX.read(f.data);
      const parsed = parseValuationWorkbook(
        wb.SheetNames.map((name) => ({
          name,
          rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, defval: "", raw: false }) as Rows,
        })),
        f.name,
      );
      if (parsed) found.push({ fileName: f.name, valuation: parsed });
      else unreadable.push(f.name);
    } catch {
      unreadable.push(f.name);
    }
  }
  return { ...pickValuations(found), unreadable };
}
