import type { OperationalWorkItem } from "./types";

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

/**
 * Build an editable email draft from a work item and the GM's instruction.
 * Deterministic — no AI required — so "create an email draft" always works
 * even when the AI writer is unavailable. The GM reviews and sends it
 * themselves; nothing is sent automatically.
 */
export function buildTaskEmailDraft(
  item: OperationalWorkItem,
  instruction: string,
  signerName: string,
): EmailDraft {
  const note = instruction.trim();
  const dueLine = item.dueDate ? `\nTarget date: ${item.dueDate}` : "";
  const sourceLine = item.sourceLabel ? `\nItem: ${item.sourceLabel}` : "";
  const context = item.description ? `\n\nBackground:\n${item.description}` : "";
  const ask = note
    ? `\n\nWhat I need:\n${note}`
    : "";

  const body =
`Hello,

I'm writing regarding "${item.title}".${sourceLine}${dueLine}${context}${ask}

Please let me know how you'd like to proceed, or if you need anything further from me.

Thank you,
${signerName}`;

  return {
    to: "",
    subject: item.title,
    body,
  };
}

/**
 * Build an email draft from a 1:1 follow-up / action item. Used by the
 * follow-up "Draft email to my superior" button. Editable and never auto-sent.
 */
export function buildFollowUpEmailDraft(
  followUpTitle: string,
  note: string,
  employeeName: string,
  signerName: string,
): EmailDraft {
  const who = employeeName.trim() || "a member of the team";
  const context = note.trim() ? `\n\nContext:\n${note.trim()}` : "";
  const body =
`Hello,

I'm writing to raise a request that came out of a recent one-on-one with ${who}:

${followUpTitle.trim()}${context}

I think it's worth supporting and wanted to get your read on it. Please let me know if you'd like more detail or how you'd like to proceed.

Thank you,
${signerName}`;

  return { to: "", subject: followUpTitle.trim(), body };
}

/** Build a mailto: URL from a draft. */
export function draftToMailto(draft: EmailDraft): string {
  const params = new URLSearchParams();
  if (draft.subject) params.set("subject", draft.subject);
  if (draft.body) params.set("body", draft.body);
  const query = params.toString().replace(/\+/g, "%20");
  return `mailto:${encodeURIComponent(draft.to)}${query ? `?${query}` : ""}`;
}
