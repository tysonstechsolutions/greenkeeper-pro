/**
 * Obligation links that point at pages which have since moved.
 *
 * Stored `link_href` values come from seed migrations, so a page that is
 * renamed or retired leaves a dead link behind until the row is updated.
 * This keeps the app correct in the meantime (and for any copy of the
 * database the fix migration hasn't reached).
 */
const MOVED_PAGES: Record<string, string> = {
  // The staff schedule. /schedule was removed 2026-07-29.
  "/schedule": "/pro-shop-schedule",
};

export function liveObligationHref(href: string | null | undefined): string | null {
  if (!href) return null;
  return MOVED_PAGES[href] ?? href;
}
