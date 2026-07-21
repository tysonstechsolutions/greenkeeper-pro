/**
 * Solo operating mode.
 *
 * This golf course is run by a single General Manager. Staff never receive
 * app logins — they get printed task lists (see
 * docs/business-guru-master-prompt.md and the `solo-gm-no-staff-accounts`
 * memory). In solo mode the Operations Command Center hides the multi-person
 * workflow controls that only make sense with logged-in staff (accept a
 * delegation, submit for independent verification, send to leadership, block,
 * dependencies, evidence) and treats "assign" as a record-only accountability
 * tag plus a printable hand-out list.
 *
 * Flip this to false if staff are ever given their own logins; the full
 * team workflow built into the unified command center remains intact.
 */
export const SOLO_MODE = true;
