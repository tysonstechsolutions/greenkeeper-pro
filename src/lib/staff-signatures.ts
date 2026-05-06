/**
 * Mapping of staff names → signature image asset paths.
 *
 * To add a signature:
 *   1. Drop a transparent-background PNG (or JPG) at
 *      public/signatures/<slug>.png
 *   2. Add an entry below mapping the staff member's full_name (case-
 *      insensitive) to the asset URL.
 *   3. The PDF generator (ast-inspection-report.ts and friends) will
 *      embed the image on the signature line when the inspection's
 *      inspector_name matches.
 *
 * Names are matched case-insensitively against `full_name`. If you
 * have multiple staff with the same first/last initials, use the full
 * legal name to avoid collisions.
 */
export const STAFF_SIGNATURES: Record<string, string> = {
  "tyson bruce": "/signatures/tyson-bruce.png",
};

export function findSignatureUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return STAFF_SIGNATURES[key] ?? null;
}
