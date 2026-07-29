// Position (role) naming for the Operations Command Center.
//
// Positions reach the command center from three sources that do not agree on
// spelling: duty occurrences carry lowercase role-group keys
// ("recreation_aide"), equipment alerts hard-code "mechanic", and Program
// Standards carry a free-text owner role that may read "Mechanic" or "GCM".
// Filtering and printing both need one identity per role, and a label that
// does not mangle an acronym.

import { DUTY_ROLE_GROUP_LABELS, normalizeDutyRoleGroup } from "@/lib/operations/duties";
import type { DutyRoleGroup } from "@/lib/operations/types";

/**
 * Stable identity for a position across sources. Null when not recorded.
 *
 * Role groups that have been merged into another resolve to the survivor, so
 * work still carrying a retired key lands on the same sheet as the rest of
 * that position's work rather than printing a second, near-empty page.
 */
export function normalizePosition(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalizeDutyRoleGroup(normalized as DutyRoleGroup) ?? normalized;
}

/**
 * Display name for a position.
 *
 * Known duty role groups use their catalogue label. Anything else is free
 * text: an all-lowercase key ("mechanic", "lead_technician") is expanded and
 * title-cased, while text that already carries its own capitalisation ("GCM",
 * "Superintendent") is left alone rather than being mangled into "Gcm".
 */
export function positionDisplayLabel(raw: string): string {
  const normalized = normalizePosition(raw);
  if (!normalized) return raw;
  const known = DUTY_ROLE_GROUP_LABELS[normalized as DutyRoleGroup];
  if (known) return known;
  const trimmed = raw.trim();
  if (trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Collapse every case variant of a position into one option.
 *
 * Returns `[normalizedValue, label]` pairs sorted by label. Where variants
 * disagree, the one carrying its own capitalisation wins the label, so an
 * acronym recorded as "GCM" is never displayed as "gcm".
 */
export function positionOptions(values: Array<string | null | undefined>): string[][] {
  const bestRaw = new Map<string, string>();
  for (const value of values) {
    const normalized = normalizePosition(value);
    if (!normalized || !value) continue;
    const current = bestRaw.get(normalized);
    if (!current || (current === current.toLowerCase() && value !== value.toLowerCase())) {
      bestRaw.set(normalized, value);
    }
  }
  return [...bestRaw.entries()]
    .map(([normalized, raw]) => [normalized, positionDisplayLabel(raw)])
    .sort((a, b) => a[1].localeCompare(b[1]));
}
