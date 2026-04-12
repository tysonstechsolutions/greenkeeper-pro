/**
 * Locale-aware text selector for bilingual rows.
 *
 * Rows in the DB store both the original text (e.g. `title`) and a Spanish
 * translation (e.g. `title_es`). Display code calls `getLocalized(row, 'title', locale)`
 * and gets the right one — falling back to the English/original field if the
 * translation is missing, null, or an empty string.
 *
 * This helper is designed to be tolerant: it never throws, always returns a
 * string, and handles the common cases where a row was inserted before the
 * translation infra existed (so `title_es` is undefined).
 */

export type SupportedLocale = "en" | "es";

// A row is just "some object with string-ish fields". We intentionally use
// `Record<string, unknown>` rather than a strict generic so we can read
// dynamic `${field}_es` keys without fighting the type system.
type LocalizableRow = Record<string, unknown>;

export function getLocalized<T extends LocalizableRow>(
  row: T | null | undefined,
  field: string,
  locale: SupportedLocale
): string {
  if (!row) return "";

  const base = row[field];
  const baseStr = typeof base === "string" ? base : base == null ? "" : String(base);

  if (locale !== "es") {
    return baseStr;
  }

  const translated = row[`${field}_es`];
  if (typeof translated === "string" && translated.trim().length > 0) {
    return translated;
  }

  return baseStr;
}
