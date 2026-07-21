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

/** Build a mailto: URL from a draft. */
export function draftToMailto(draft: EmailDraft): string {
  const params = new URLSearchParams();
  if (draft.subject) params.set("subject", draft.subject);
  if (draft.body) params.set("body", draft.body);
  const query = params.toString().replace(/\+/g, "%20");
  return `mailto:${encodeURIComponent(draft.to)}${query ? `?${query}` : ""}`;
}
