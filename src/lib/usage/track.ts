"use client";

/**
 * Usage tracking — what actually gets used, so the app can be improved from
 * real days rather than guesses.
 *
 * WHAT IS SENT
 * ------------
 * The route, an event kind, an optional fixed-vocabulary label, and a duration.
 * That is all. `normaliseRoute` strips query strings and replaces id-shaped
 * path segments, so a task id, a search term or a staff name can never ride
 * along in a URL. Labels come from a closed set defined in the calling code —
 * never from anything the GM types.
 *
 * Writes are fire-and-forget and failure is silent: telemetry must never
 * interrupt, slow, or break the actual work.
 */

import { directInsertRow } from "@/lib/supabase/rest";

export type UsageEventKind = "view" | "action" | "slow";

/** A screen is "slow" past this, and worth recording separately. */
export const SLOW_VIEW_MS = 2500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX_RE = /^[0-9a-f]{16,}$/i;

/**
 * Reduce a URL to a shape safe to store and useful to group by.
 *
 * Drops the query string and hash entirely — that is where ids, search terms
 * and filter values live — and replaces any path segment that looks like an
 * identifier with `:id` so `/tasks/view/<uuid>` groups with its siblings.
 */
export function normaliseRoute(pathAndQuery: string): string {
  const path = pathAndQuery.split(/[?#]/)[0] || "/";
  const segments = path.split("/").filter(Boolean).map((segment) => {
    if (UUID_RE.test(segment)) return ":id";
    if (LONG_HEX_RE.test(segment)) return ":id";
    if (/^\d+$/.test(segment)) return ":id";
    // Dated segments such as 2026-07-27.
    if (/^\d{4}-\d{2}-\d{2}$/.test(segment)) return ":date";
    return segment;
  });
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/** Labels must be short, lower-case and free of anything typed by a person. */
export function isSafeLabel(label: string): boolean {
  return /^[a-z0-9_]{1,48}$/.test(label);
}

interface TrackInput {
  kind: UsageEventKind;
  route: string;
  label?: string;
  durationMs?: number;
}

let enabled = true;

/** Turn recording off for the rest of the session (used by the opt-out). */
export function setUsageTrackingEnabled(value: boolean): void {
  enabled = value;
  try {
    window.localStorage.setItem("gk_usage_tracking", value ? "on" : "off");
  } catch { /* private mode — in-memory flag still applies */ }
}

export function isUsageTrackingEnabled(): boolean {
  try {
    return window.localStorage.getItem("gk_usage_tracking") !== "off";
  } catch {
    return enabled;
  }
}

/**
 * Record one event. Never throws, never blocks the caller, and silently drops
 * anything that does not meet the safety rules above.
 */
export async function trackUsage(input: TrackInput): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isUsageTrackingEnabled()) return;

  const route = normaliseRoute(input.route);
  const label = input.label && isSafeLabel(input.label) ? input.label : null;
  const durationMs = typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
    ? Math.max(0, Math.round(input.durationMs))
    : null;

  try {
    await directInsertRow("usage_events", {
      event_kind: input.kind,
      route,
      label,
      duration_ms: durationMs,
    }, "usage.track");
  } catch {
    // Telemetry must never surface as an error to the person doing the work.
  }
}

/** Convenience for the common case: a named action on the current screen. */
export function trackAction(label: string, route?: string): void {
  void trackUsage({
    kind: "action",
    route: route ?? window.location.pathname,
    label,
  });
}
