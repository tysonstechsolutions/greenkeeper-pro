/**
 * SF-52 (Request for Personnel Action) PDF generator.
 *
 * Fills the office's real fillable SF-52 (public/templates/sf52-form.pdf,
 * an AES-256 encrypted AcroForm) with pdf.js: values go into the actual
 * form fields and the file is saved as an incremental update — the same
 * mechanism Acrobat uses. The download therefore keeps live (blue) form
 * fields, stays encrypted like the office's own copies, and the box 5/6 and
 * Part E signature fields remain blank and signable (CAC) in Adobe.
 *
 * pdf-lib can NOT open this form (AES-256/R6 encryption), which is why this
 * one report uses pdf.js while the app's other reports keep pdf-lib/jsPDF.
 */
import { SF52_FIELDS, SF52_CHECKBOX_FIELDS, type Sf52FieldKey } from "@/lib/sf52/sf52-fields";

/** All filled values keyed by field; plus the optional Part D checkbox. */
export type Sf52Data = Partial<Record<Sf52FieldKey, string>> & {
  conflictingReasons?: "yes" | "no" | null;
};

const TEMPLATE_URL = "/templates/sf52-form.pdf";
const WORKER_URL = "/vendor/pdf.worker.min.mjs";

/** The form's Helvetica appearance can't encode smart quotes — fold to ASCII. */
function sanitize(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ");
}

/** The form's fields use \r as the line separator (like the office's copies). */
function toFieldText(s: string): string {
  return sanitize(s).replace(/\r\n|\n/g, "\r");
}

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/** Load pdf.js once; in the browser point it at the vendored worker. */
function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
    }
    return pdfjs;
  });
  return pdfjsPromise;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function generateSf52Report(
  data: Sf52Data,
  filename = "SF52.pdf",
): Promise<{ blob: Blob; filename: string }> {
  const [pdfjs, template] = await Promise.all([loadPdfjs(), fetchBytes(TEMPLATE_URL)]);

  const doc = await pdfjs.getDocument({
    data: template,
    // Standard-14 font data for generating field appearances (Helvetica).
    ...(typeof window !== "undefined" ? { standardFontDataUrl: "/vendor/standard_fonts/" } : {}),
  }).promise;
  try {
    // Field name -> annotation ids (a name can appear on both pages, e.g.
    // EffectiveDate is one field shared by Part B box 4 and Part E box 2).
    const idsByName = new Map<string, string[]>();
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      for (const ann of await page.getAnnotations()) {
        const a = ann as { fieldName?: string; id: string };
        if (!a.fieldName) continue;
        const ids = idsByName.get(a.fieldName) ?? [];
        ids.push(a.id);
        idsByName.set(a.fieldName, ids);
      }
    }

    for (const key of Object.keys(SF52_FIELDS) as Sf52FieldKey[]) {
      const raw = data[key];
      if (!raw || !raw.trim()) continue;
      const fieldName = SF52_FIELDS[key];
      const ids = idsByName.get(fieldName);
      if (!ids) throw new Error(`SF-52 template is missing the "${fieldName}" field`);
      // Trim outer spaces but keep a trailing newline (the office's org-block
      // values end with one, which also drives Acrobat's auto-size).
      const value = toFieldText(raw.replace(/^\s+/, "").replace(/[ \t]+$/, ""));
      for (const id of ids) doc.annotationStorage.setValue(id, { value });
    }

    if (data.conflictingReasons === "yes" || data.conflictingReasons === "no") {
      const fieldName =
        data.conflictingReasons === "yes"
          ? SF52_CHECKBOX_FIELDS.conflictingReasonsYes
          : SF52_CHECKBOX_FIELDS.conflictingReasonsNo;
      for (const id of idsByName.get(fieldName) ?? []) {
        doc.annotationStorage.setValue(id, { value: true });
      }
    }

    const bytes = await doc.saveDocument();
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    return { blob, filename };
  } finally {
    await doc.destroy();
  }
}

const FILE_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "07JUL26" — the date stamp the office puts on recruitment SF-52 filenames. */
function fileDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}${FILE_MONTHS[d.getMonth()]}${String(d.getFullYear()).slice(2)}`;
}

/**
 * Filename conventions from the office's own saved SF-52s:
 *  - employee actions: "SF52_Resignation_Damian_Golf Mechanic.pdf"
 *    (action _ last name _ position title)
 *  - recruitments (vacancy, no employee):
 *    "SF52_Recruitment_NA-08 Mechanic_07JUL26.pdf"
 *    (action _ plan-grade + title _ date created)
 * Parts joined by underscores, spaces kept inside each part.
 */
export function sf52Filename(args: {
  action: string;
  positionTitle: string;
  lastName?: string;
  /** Recruitment naming: no last name; plan-grade prefix + date suffix. */
  vacancy?: boolean;
  payPlan?: string;
  grade?: string;
  now?: Date;
}): string {
  const clean = (s: string) =>
    (s || "")
      .replace(/[\\/:*?"<>|_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const parts = args.vacancy
    ? [
        "SF52",
        clean(args.action),
        [
          [clean(args.payPlan ?? ""), clean(args.grade ?? "")].filter(Boolean).join("-"),
          clean(args.positionTitle),
        ]
          .filter(Boolean)
          .join(" "),
        fileDate(args.now ?? new Date()),
      ]
    : ["SF52", clean(args.action), clean(args.lastName ?? ""), clean(args.positionTitle)];
  return `${parts.filter(Boolean).join("_")}.pdf`;
}
