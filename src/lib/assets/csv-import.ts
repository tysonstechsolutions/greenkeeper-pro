// DPAS/ELMS CSV import helpers — pure and unit-testable.
//
// The property system on the government computer exports Excel/CSV from
// Inquiries > Asset Management > Asset (or the Custodian Asset Report).
// Column names vary by report, so headers are auto-guessed from synonyms
// and every guess is adjustable in the UI before anything is written.
// NEVER automate against the .mil system itself — the user exports by hand.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Quote-aware CSV parser (handles quoted commas, doubled quotes, CRLF). */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // Skip fully empty lines.
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushField();
      pushRow();
    } else if (ch === "\r") {
      // swallow — \r\n handled by the \n branch
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  if (rows.length === 0) return { headers: [], rows: [] };
  const [headers, ...data] = rows;
  return { headers: headers.map((h) => h.trim()), rows: data };
}

/** The fy26_assets fields an import can fill. */
export type AssetField =
  | "asset_number"
  | "sub_number"
  | "serial_number"
  | "description"
  | "manufacturer"
  | "model_text"
  | "cost_center"
  | "original_value"
  | "qty";

export const ASSET_FIELD_LABELS: Record<AssetField, string> = {
  asset_number: "Asset number *",
  sub_number: "Sub number",
  serial_number: "Serial number",
  description: "Description *",
  manufacturer: "Manufacturer",
  model_text: "Model",
  cost_center: "Cost center",
  original_value: "Acquisition cost",
  qty: "Quantity",
};

/** Header synonyms per field — DPAS inquiry extracts, custodian reports,
 *  and the legacy Flexible Asset Listing all spell things differently. */
const HEADER_SYNONYMS: Record<AssetField, string[]> = {
  asset_number: ["asset id", "asset number", "asset nbr", "asset", "asset #"],
  sub_number: ["sub number", "sub nbr", "sub asset", "sub"],
  serial_number: ["serial nbr", "serial number", "serial", "dod serial nbr", "serial no"],
  description: ["item desc", "description", "nomenclature", "item description", "asset desc"],
  manufacturer: ["manufacturer", "mfr", "mfg", "manufacturer name"],
  model_text: ["model", "model nbr", "model number", "model no"],
  cost_center: ["cost center", "cost ctr", "custodian", "custodian nbr"],
  original_value: ["acq cost", "acquisition cost", "original value", "total cost", "unit cost", "cost"],
  qty: ["qty", "quantity", "on hand"],
};

/** Best-guess mapping from CSV headers to asset fields. */
export function guessMapping(headers: string[]): Partial<Record<AssetField, number>> {
  const mapping: Partial<Record<AssetField, number>> = {};
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS) as [AssetField, string[]][]) {
    for (const syn of synonyms) {
      const idx = lower.findIndex((h) => h === syn || h.startsWith(syn));
      if (idx >= 0 && !Object.values(mapping).includes(idx)) {
        mapping[field] = idx;
        break;
      }
    }
  }
  return mapping;
}

export interface ImportCandidate {
  asset_number: string;
  sub_number: string | null;
  serial_number: string | null;
  description: string;
  manufacturer: string | null;
  model_text: string | null;
  cost_center: string | null;
  original_value: number | null;
  qty: number;
  /** Why this row can't import (null = importable). */
  problem: string | null;
  /** True when an existing asset already carries this number/serial. */
  duplicate: boolean;
}

function cleanMoney(v: string): number | null {
  const n = parseFloat(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Build import candidates from parsed rows + a column mapping, marking
 *  duplicates against the existing inventory. */
export function buildCandidates(
  parsed: ParsedCsv,
  mapping: Partial<Record<AssetField, number>>,
  existing: { asset_number: string; serial_number: string | null }[],
): ImportCandidate[] {
  const byNumber = new Set(existing.map((e) => e.asset_number.trim()));
  const bySerial = new Set(
    existing.map((e) => e.serial_number?.trim().toLowerCase()).filter(Boolean) as string[],
  );

  const get = (row: string[], field: AssetField): string => {
    const idx = mapping[field];
    return idx == null ? "" : (row[idx] ?? "").trim();
  };

  return parsed.rows.map((row) => {
    const asset_number = get(row, "asset_number");
    const description = get(row, "description");
    const serial = get(row, "serial_number") || null;
    const qtyRaw = get(row, "qty");
    const qty = qtyRaw ? parseFloat(qtyRaw) : 1;

    const problem = !asset_number
      ? "missing asset number"
      : !description
        ? "missing description"
        : null;

    const duplicate =
      byNumber.has(asset_number) ||
      (serial != null && bySerial.has(serial.toLowerCase()));

    return {
      asset_number,
      sub_number: get(row, "sub_number") || null,
      serial_number: serial,
      description,
      manufacturer: get(row, "manufacturer") || null,
      model_text: get(row, "model_text") || null,
      cost_center: get(row, "cost_center") || null,
      original_value: cleanMoney(get(row, "original_value")),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      problem,
      duplicate,
    };
  });
}
