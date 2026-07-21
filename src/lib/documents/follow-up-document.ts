/**
 * Turn a 1:1 follow-up / action item into an editable, printable document.
 *
 * The GM pushes "Create document" next to a follow-up like "signed agreements
 * for clubs and carts" and gets a real draft they can edit and print — no AI
 * dependency, so it always works. Placeholders use [brackets] so nothing is
 * fabricated about the specific course, fees, or people.
 */

import { COURSE_NAME } from "@/lib/config/org";

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
  orgName = COURSE_NAME,
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
`${orgName.toUpperCase()}
EQUIPMENT RENTAL AGREEMENT

This Equipment Rental Agreement ("Agreement") is made between ${orgName}
("the Course") and the undersigned ("Renter") governing the rental and use of
${covers}.

1. RENTER INFORMATION
   Name: ______________________________________
   Phone: _____________________   Email: _____________________
   Date of rental: ____________   Time out: ________   Due back: ________

2. EQUIPMENT RENTED
   [ ] Golf cart(s) — Quantity: ____   Unit number(s): ____________
   [ ] Golf club set(s) — Quantity: ____   Set number(s): ____________
   [ ] Other: ____________________________________________

3. CONDITION AND USE
   The Renter acknowledges receiving the equipment in good working condition and
   agrees to use it only for its intended purpose and in accordance with all
   Course rules and posted signage. Golf carts shall be operated only by licensed
   drivers of legal age and only in areas designated by the Course.

4. CARE AND RETURN
   The Renter agrees to return the equipment by the time stated above in the same
   condition in which it was received, ordinary wear excepted, and to report any
   damage, loss, or malfunction to Course staff immediately.

5. RESPONSIBILITY
   The Renter assumes responsibility for the equipment while it is in their
   possession and agrees to be responsible for any loss, theft, or damage beyond
   ordinary wear.

6. LIABILITY
   The Renter agrees that the Course shall not be liable for any injury, loss, or
   damage arising from the Renter's use or operation of the equipment, and the
   Renter uses the equipment at their own risk.
${extra}
7. ACKNOWLEDGEMENT
   By signing below, the Renter acknowledges that they have read, understood, and
   agree to the terms of this Agreement.

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
