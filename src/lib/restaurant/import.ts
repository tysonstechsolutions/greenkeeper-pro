/**
 * Turn a pile of US Foods files (PDFs, or a .zip of them) into purchases to
 * save: invoices and credit memos with their line items, the base's Bulk
 * Funding Order cover sheets matched to their invoice, and anything already
 * saved (or in the pile twice) skipped.
 *
 * readUsFoodsFiles does the PDF reading; planUsFoodsImport is pure.
 */
import JSZip from "jszip";
import { pdfFormFields, pdfTextLines } from "@/lib/pdf/text-lines";
import {
  categoryTotals,
  parseBulkFundingOrder,
  parseUsFoodsDocument,
  type BulkFundingOrder,
  type UsFoodsDocument,
} from "./usfoods";

export const US_FOODS = "US Foods";

export interface InputFile {
  name: string;
  data: Uint8Array;
}

export interface ReadDocument extends UsFoodsDocument {
  fileName: string;
  /** The PDF, so it can be kept with the purchase. */
  data: Uint8Array;
}

export interface ReadResult {
  documents: ReadDocument[];
  coverSheets: (BulkFundingOrder & { fileName: string })[];
  /** Files that were not a US Foods invoice, credit, or cover sheet. */
  unreadable: string[];
}

const isPdf = (name: string) => /\.pdf$/i.test(name);
const isZip = (name: string) => /\.zip$/i.test(name);

/** Open .zip files and keep the PDFs (skipping macOS resource forks). */
export async function expandFiles(files: InputFile[]): Promise<{ pdfs: InputFile[]; other: string[] }> {
  const pdfs: InputFile[] = [];
  const other: string[] = [];
  for (const f of files) {
    if (isZip(f.name)) {
      const zip = await JSZip.loadAsync(f.data);
      for (const entry of Object.values(zip.files)) {
        const base = entry.name.split("/").pop() ?? entry.name;
        if (entry.dir || entry.name.startsWith("__MACOSX/") || base.startsWith("._")) continue;
        if (isPdf(base)) pdfs.push({ name: base, data: await entry.async("uint8array") });
        else other.push(base);
      }
    } else if (isPdf(f.name)) {
      pdfs.push(f);
    } else {
      other.push(f.name);
    }
  }
  return { pdfs, other };
}

/** Read every file: invoice or credit memo first, cover sheet second. */
export async function readUsFoodsFiles(files: InputFile[]): Promise<ReadResult> {
  const { pdfs, other } = await expandFiles(files);
  const result: ReadResult = { documents: [], coverSheets: [], unreadable: [...other] };
  for (const f of pdfs) {
    try {
      // pdf.js may take ownership of the buffer it reads; give it copies.
      const doc = parseUsFoodsDocument(await pdfTextLines(f.data.slice()));
      if (doc) {
        result.documents.push({ ...doc, fileName: f.name, data: f.data });
        continue;
      }
      const cover = parseBulkFundingOrder(await pdfFormFields(f.data.slice()));
      if (cover) {
        result.coverSheets.push({ ...cover, fileName: f.name });
        continue;
      }
      result.unreadable.push(f.name);
    } catch {
      result.unreadable.push(f.name);
    }
  }
  return result;
}

/** A purchase already saved, enough to spot a repeat. */
export interface ExistingPurchase {
  vendor: string;
  kind: string | null;
  document_number: string | null;
}

export interface PlannedPurchase {
  doc: ReadDocument;
  row: {
    purchase_date: string;
    vendor: string;
    amount: number;
    kind: "invoice" | "credit";
    document_number: string;
    against_invoice: string | null;
    order_number: string | null;
    delivery_order: string | null;
    site: string | null;
    food_amount: number;
    alcohol_amount: number;
    supplies_amount: number;
    notes: string;
  };
  lines: {
    line_no: number;
    section: string | null;
    product_number: string;
    description: string;
    brand: string | null;
    pack_size: string | null;
    qty: number;
    unit: string;
    unit_price: number;
    extended: number;
    category: string;
  }[];
}

export interface ImportPlan {
  toSave: PlannedPurchase[];
  /** "Invoice 2160562 (InvoiceDetails7.pdf)" — already saved or a repeat file. */
  duplicates: string[];
}

const docKey = (kind: string, number: string) => `${kind}:${number}`;

export function documentLabel(doc: Pick<UsFoodsDocument, "kind" | "documentNumber" | "invoiceNumber">): string {
  return doc.kind === "credit"
    ? `Credit memo ${doc.documentNumber} (on invoice ${doc.invoiceNumber})`
    : `Invoice ${doc.documentNumber}`;
}

/**
 * What to save. Pure. A document is skipped when that vendor + kind + number
 * is already saved or appeared earlier in the pile. A cover sheet supplies
 * the delivery order and site for its invoice (and for a credit against it).
 */
export function planUsFoodsImport(read: Pick<ReadResult, "documents" | "coverSheets">, existing: ExistingPurchase[]): ImportPlan {
  const seen = new Set(
    existing
      .filter((e) => e.vendor.trim().toLowerCase() === US_FOODS.toLowerCase() && e.document_number)
      .map((e) => docKey(e.kind ?? "invoice", e.document_number!)),
  );
  const covers = new Map(read.coverSheets.map((c) => [c.invoiceNumber, c]));
  const plan: ImportPlan = { toSave: [], duplicates: [] };

  const ordered = [...read.documents].sort(
    (a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.documentNumber.localeCompare(b.documentNumber),
  );
  for (const doc of ordered) {
    const key = docKey(doc.kind, doc.documentNumber);
    if (seen.has(key)) {
      plan.duplicates.push(`${documentLabel(doc)} (${doc.fileName})`);
      continue;
    }
    seen.add(key);
    const cover = covers.get(doc.invoiceNumber);
    const totals = categoryTotals(doc);
    plan.toSave.push({
      doc,
      row: {
        purchase_date: doc.date,
        vendor: US_FOODS,
        amount: doc.total,
        kind: doc.kind,
        document_number: doc.documentNumber,
        against_invoice: doc.kind === "credit" ? doc.invoiceNumber : null,
        order_number: doc.orderNumber,
        delivery_order: cover?.deliveryOrder ?? null,
        site: cover?.site ?? null,
        food_amount: totals.food,
        alcohol_amount: totals.alcohol,
        supplies_amount: totals.supplies,
        notes: `${documentLabel(doc)} · ${doc.lines.length} item${doc.lines.length === 1 ? "" : "s"}`,
      },
      lines: doc.lines.map((l, i) => ({
        line_no: i + 1,
        section: l.section,
        product_number: l.productNumber,
        description: l.description,
        brand: l.brand || null,
        pack_size: l.packSize || null,
        qty: l.qty,
        unit: l.unit,
        unit_price: l.unitPrice,
        extended: l.extended,
        category: l.category,
      })),
    });
  }
  return plan;
}
