/**
 * Spreadsheet attachments for the AI assistant.
 *
 * Excel/CSV files (US Foods orders, invoices, price lists) are parsed
 * CLIENT-SIDE into CSV text and inlined into the chat message, so the
 * deployed ai-assistant edge function needs no changes and no redeploy.
 * SheetJS is dynamic-imported so the parser only loads into the bundle
 * chunk that runs when a spreadsheet is actually attached.
 *
 * The deployed function rejects messages over 12,000 characters
 * (MAX_MESSAGE_LENGTH in supabase/functions/ai-assistant/index.ts), so the
 * sheet text is truncated to a budget that leaves room for the user's note
 * and the wrapper — with an explicit note telling the AI what was cut.
 */

/** `accept` attribute for the attach-file input. */
export const SPREADSHEET_ACCEPT = ".xlsx,.xls,.csv,.tsv";

const SPREADSHEET_EXT_RE = /\.(xlsx|xls|csv|tsv)$/i;

/** 10MB — plenty for any order/invoice export, guards against mispicks. */
export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;

/**
 * Character budget for the sheet text inside one chat message. The deployed
 * edge function caps the whole message at 12,000 chars; 11,000 leaves room
 * for the user's typed note and the attachment wrapper.
 */
export const SPREADSHEET_TEXT_BUDGET = 11_000;

/** Space reserved at the end of a truncated text for the "[truncated…]" note. */
const TRUNCATION_NOTE_RESERVE = 80;

export interface SpreadsheetText {
  /** Original filename, shown in the chat bubble and the message wrapper. */
  name: string;
  /** CSV text of the sheet(s); labeled per sheet when there are several. */
  text: string;
  /** Total CSV rows across all sheets, BEFORE truncation. */
  rowCount: number;
  sheetCount: number;
  truncated: boolean;
}

/** True when the file looks like a spreadsheet we can parse (by extension —
 *  browsers report unreliable MIME types for CSV/XLS). */
export function isSpreadsheetFile(file: { name: string }): boolean {
  return SPREADSHEET_EXT_RE.test(file.name || "");
}

/**
 * Cut CSV text to `budget` characters on whole-line boundaries, appending a
 * note with how many rows were dropped so the AI knows the data is partial.
 */
export function truncateToBudget(
  text: string,
  budget: number,
): { text: string; truncated: boolean } {
  if (text.length <= budget) return { text, truncated: false };

  const lines = text.split("\n");
  const kept: string[] = [];
  let used = 0;
  const limit = Math.max(0, budget - TRUNCATION_NOTE_RESERVE);
  for (const line of lines) {
    // +1 for the newline that joins it.
    if (used + line.length + 1 > limit) break;
    kept.push(line);
    used += line.length + 1;
  }
  const dropped = lines.length - kept.length;
  kept.push(`[truncated — ${dropped} more rows not shown]`);
  return { text: kept.join("\n"), truncated: true };
}

/** Non-empty line count (CSV rows). */
function countRows(text: string): number {
  return text.split("\n").filter((l) => l.trim() !== "").length;
}

/**
 * Parse a spreadsheet File into CSV text ready to inline into a chat
 * message. CSV/TSV files are read as-is (no parser download); Excel files
 * go through SheetJS with date cells formatted as displayed, not as Excel
 * serial numbers. Throws a user-facing Error on anything unreadable.
 */
export async function spreadsheetToText(file: File): Promise<SpreadsheetText> {
  if (file.size > MAX_SPREADSHEET_BYTES) {
    throw new Error(
      `${file.name} is too large (max ${Math.round(MAX_SPREADSHEET_BYTES / 1024 / 1024)}MB).`,
    );
  }

  const isPlainText = /\.(csv|tsv)$/i.test(file.name || "");
  let raw: string;
  let sheetCount = 1;

  if (isPlainText) {
    raw = (await file.text()).replace(/\r\n/g, "\n").trim();
  } else {
    let workbook;
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      workbook = XLSX.read(buf, { type: "array", cellDates: true });
      const parts: string[] = [];
      const sheetNames = workbook.SheetNames;
      for (const sheetName of sheetNames) {
        const csv = XLSX.utils
          .sheet_to_csv(workbook.Sheets[sheetName], { blankrows: false })
          .replace(/\r\n/g, "\n")
          .trim();
        if (!csv) continue;
        parts.push(
          sheetNames.length > 1 ? `=== Sheet: ${sheetName} ===\n${csv}` : csv,
        );
      }
      sheetCount = parts.length || 1;
      raw = parts.join("\n\n");
    } catch (err) {
      console.error("Spreadsheet parse failed:", err);
      throw new Error(
        `Couldn't read ${file.name} — is it a valid Excel/CSV file?`,
      );
    }
  }

  // Strip control characters (never meaningful in a spreadsheet). SheetJS
  // CSV-parses unrecognized bytes instead of throwing, so corrupt files
  // surface here as garbage that sanitizes down to nothing.
  raw = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();

  if (!raw || countRows(raw) === 0) {
    throw new Error(
      `${file.name} has no readable rows — is it a valid spreadsheet?`,
    );
  }

  const rowCount = countRows(raw);
  const { text, truncated } = truncateToBudget(raw, SPREADSHEET_TEXT_BUDGET);
  return { name: file.name, text, rowCount, sheetCount, truncated };
}

/**
 * The attachment block appended to the chat message sent to the AI.
 * `maxChars` re-clamps the sheet text when the user's typed note ate into
 * the 12k message budget.
 */
export function buildSpreadsheetBlock(
  sheet: SpreadsheetText,
  maxChars: number,
): string {
  const header = `[Spreadsheet attached: ${sheet.name} — ${sheet.sheetCount} sheet${sheet.sheetCount === 1 ? "" : "s"}, contents as CSV below]`;
  const room = Math.max(500, maxChars - header.length - 2);
  const { text } = truncateToBudget(sheet.text, room);
  return `${header}\n${text}`;
}
