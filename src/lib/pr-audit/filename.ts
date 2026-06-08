/**
 * Pure filename helpers for PR Audit downloads. Kept dependency-free (no jsPDF /
 * JSZip / supabase) so they're cheap to unit-test and import.
 */
import type { PrAudit } from "@/types/database";

/** Strip filename-illegal characters for cross-platform safety. */
function sanitize(s: string): string {
  return (
    s
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim() || "PR"
  );
}

/** Guess a file extension from a stored filename or MIME type. Defaults to pdf. */
export function guessExt(fileName: string | null, mime?: string): string {
  const name = fileName || "";
  if (name.includes(".")) {
    const fromName = name.split(".").pop()?.toLowerCase();
    if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/.test(fromName)) {
      return fromName;
    }
  }
  const m = (mime || "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "pdf";
}

/** Stable, readable download name: "PR Audit - {vendor} - {date}.{ext}". */
export function prAuditFilename(
  audit: Pick<PrAudit, "vendor_name" | "pr_date">,
  ext: string,
): string {
  const vendor = sanitize(audit.vendor_name || "Vendor");
  const date = (audit.pr_date || "").slice(0, 10) || "undated";
  return `PR Audit - ${vendor} - ${date}.${ext}`;
}
