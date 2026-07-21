/**
 * Turn a 1:1 follow-up / action item into an editable, printable document.
 *
 * The GM pushes "Create document" next to a follow-up like "signed agreements
 * for clubs and carts" and gets a real draft they can edit and print — no AI
 * dependency, so it always works. Placeholders use [brackets] so nothing is
 * fabricated about the specific course, fees, or people.
 */

export type FollowUpDocType = "rental_agreement" | "policy" | "form" | "letter" | "generic";

export interface FollowUpClassification {
  canCreateDoc: boolean;
  docType: FollowUpDocType;
}

const RENTAL = /\b(rental|rent|lease|agreement|contract|waiver|cart|club|equipment)s?\b/i;
const POLICY = /\b(polic(?:y|ies)|procedure|sop|guideline|rule|standard)s?\b/i;
const FORM = /\b(form|checklist|sheet|log|roster|sign[- ]?up|template)s?\b/i;
const LETTER = /\b(letter|memo|notice|announcement|bulletin)s?\b/i;
const DOC_INTENT = /\b(document|doc|file|create|make|draft|write|prepare|agreement|contract|form|polic(?:y|ies)|sop|letter|memo|waiver|signed?|sheet|checklist|template|guideline|procedure|rental|cart|club)s?\b/i;

/** Decide whether a follow-up should offer "Create document" and which template. */
export function classifyFollowUp(text: string): FollowUpClassification {
  const value = text || "";
  let docType: FollowUpDocType = "generic";
  if (RENTAL.test(value) && /\b(agreements?|contracts?|rental|rent|lease|waiver|signed?)\b/i.test(value)) {
    docType = "rental_agreement";
  } else if (POLICY.test(value)) {
    docType = "policy";
  } else if (FORM.test(value)) {
    docType = "form";
  } else if (LETTER.test(value)) {
    docType = "letter";
  }
  return { canCreateDoc: DOC_INTENT.test(value), docType };
}

export interface FollowUpDocument {
  title: string;
  body: string;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build the editable document draft for a follow-up. */
export function buildFollowUpDocument(
  followUpTitle: string,
  note: string,
  docType: FollowUpDocType,
  orgName = "[Course Name]",
): FollowUpDocument {
  const source = `${followUpTitle} ${note}`.toLowerCase();
  const extra = note.trim() ? `\n\nNotes:\n${note.trim()}\n` : "\n";

  if (docType === "rental_agreement") {
    const covers = [
      /\bcart/.test(source) ? "golf cart(s)" : null,
      /\bclub/.test(source) ? "golf club set(s)" : null,
    ].filter(Boolean).join(" and ") || "the rental equipment listed below";
    return {
      title: "Equipment Rental Agreement",
      body:
`${orgName.toUpperCase()} — EQUIPMENT RENTAL AGREEMENT

This Rental Agreement ("Agreement") is entered into between ${orgName} ("the Course")
and the individual named below ("Renter") for the rental of ${covers}.

RENTER INFORMATION
  Name: ______________________________________
  Phone: _____________________  Email: _____________________
  Date of rental: ____________  Time out: ________  Due back: ________

EQUIPMENT RENTED
  [ ] Golf cart(s) — Qty: ____   Unit #(s): ____________
  [ ] Golf club set(s) — Qty: ____   Set #(s): ____________
  [ ] Other: ____________________________________________

FEES & DEPOSIT
  Rental fee: $__________     Security deposit: $__________
  Payment method: [ ] Cash  [ ] Card  [ ] Charge to account

TERMS AND CONDITIONS
  1. The Renter is responsible for the equipment from time of checkout until returned.
  2. Equipment must be returned in the same condition, normal wear excepted.
  3. The Renter agrees to pay for any loss, theft, or damage beyond normal wear.
  4. Carts must be operated only by licensed drivers of legal age, in designated areas.
  5. The Course is not liable for injury or loss arising from the Renter's use of the equipment.
  6. Late returns may incur additional charges at the posted rate.
${extra}
ACKNOWLEDGEMENT
  I have read and agree to the terms of this Agreement.

  Renter signature: ______________________________   Date: ____________

  Course representative: __________________________   Date: ____________`,
    };
  }

  if (docType === "policy") {
    return {
      title: titleCase(followUpTitle),
      body:
`${orgName.toUpperCase()}
POLICY / STANDARD OPERATING PROCEDURE

Title: ${titleCase(followUpTitle)}
Effective date: ____________     Owner: ____________     Version: 1.0

1. PURPOSE
   [State why this policy exists and the outcome it protects.]

2. SCOPE
   [Who and what this applies to.]

3. POLICY / PROCEDURE
   [Step-by-step expectations. Number each step.]
${extra}
4. RESPONSIBILITIES
   [Who is accountable for each part.]

5. REVIEW
   This document is reviewed annually or when conditions change.

Approved by: ______________________________   Date: ____________`,
    };
  }

  if (docType === "form") {
    return {
      title: titleCase(followUpTitle),
      body:
`${orgName.toUpperCase()} — ${titleCase(followUpTitle)}

Date: ____________     Completed by: ______________________________

  Item / Task                                   Done   Notes
  ____________________________________________   [ ]   ________________
  ____________________________________________   [ ]   ________________
  ____________________________________________   [ ]   ________________
  ____________________________________________   [ ]   ________________
  ____________________________________________   [ ]   ________________
${extra}
Signature: ______________________________   Date: ____________`,
    };
  }

  if (docType === "letter") {
    return {
      title: titleCase(followUpTitle),
      body:
`${orgName}
[Address line]
[City, State ZIP]

${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

To Whom It May Concern,

[Opening — state the purpose of this letter regarding: ${followUpTitle.trim()}.]
${extra}
[Body — provide the detail and any request or action needed.]

Sincerely,


______________________________
[Name], [Title]
${orgName}`,
    };
  }

  return {
    title: titleCase(followUpTitle),
    body:
`${orgName.toUpperCase()} — ${titleCase(followUpTitle)}

${followUpTitle.trim()}
${extra}
[Add the details of this document here, then edit and print.]`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Self-contained printable HTML for a document draft. */
export function buildDocumentPrintHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 32px; line-height: 1.5; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  pre { font-family: inherit; white-space: pre-wrap; font-size: 13px; margin: 0; }
  @media print { body { margin: 16mm; } }
</style></head>
<body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(body)}</pre></body></html>`;
}
