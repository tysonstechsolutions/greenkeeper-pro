import { describe, expect, it } from "vitest";
import {
  classifyFollowUp,
  buildFollowUpDocument,
  buildDocumentPrintHtml,
} from "@/lib/documents/follow-up-document";
import { buildFollowUpEmailDraft } from "@/lib/operational-work/email-draft";

describe("classifyFollowUp", () => {
  it("offers a rental agreement for 'signed agreements for clubs and carts'", () => {
    const c = classifyFollowUp("signed agreements for clubs and carts");
    expect(c.canCreateDoc).toBe(true);
    expect(c.docType).toBe("rental_agreement");
  });

  it("does not offer a document for a non-doc follow-up", () => {
    const c = classifyFollowUp("Request tip jar for front desk staff");
    expect(c.canCreateDoc).toBe(false);
  });

  it("detects policy, form, and letter intents", () => {
    expect(classifyFollowUp("write up a cleaning policy").docType).toBe("policy");
    expect(classifyFollowUp("create a sign-up sheet for the tournament").docType).toBe("form");
    expect(classifyFollowUp("draft a memo to the crew").docType).toBe("letter");
  });
});

describe("buildFollowUpDocument", () => {
  it("builds an editable rental agreement that mentions carts and clubs", () => {
    const doc = buildFollowUpDocument("signed agreements for clubs and carts", "", "rental_agreement");
    expect(doc.title).toBe("Equipment Rental Agreement");
    expect(doc.body).toContain("RENTAL AGREEMENT");
    expect(doc.body.toLowerCase()).toContain("cart");
    expect(doc.body.toLowerCase()).toContain("club");
    expect(doc.body).toContain("Renter signature");
  });

  it("produces printable, escaped HTML", () => {
    const html = buildDocumentPrintHtml("A & B <Agreement>", "line one\nline two");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("A &amp; B &lt;Agreement&gt;");
    expect(html).toContain("line one");
  });
});

describe("buildFollowUpEmailDraft", () => {
  it("drafts an email to a superior about the follow-up", () => {
    const draft = buildFollowUpEmailDraft(
      "Request tip jar for front desk staff",
      "They feel it would boost morale.",
      "Mike Pelletier",
      "General Manager",
    );
    expect(draft.subject).toBe("Request tip jar for front desk staff");
    expect(draft.body).toContain("Mike Pelletier");
    expect(draft.body).toContain("General Manager");
    expect(draft.body).toContain("boost morale");
    expect(draft.to).toBe("");
  });
});
