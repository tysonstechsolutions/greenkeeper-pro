import { describe, expect, it } from "vitest";
import {
  groupDocumentsByObligation,
  type ObligationDocument,
} from "@/lib/operations/obligation-documents";

function doc(over: Partial<ObligationDocument>): ObligationDocument {
  return {
    id: "d1",
    obligation_id: "o1",
    storage_path: null,
    file_name: null,
    mime_type: null,
    instructions: null,
    due_date: null,
    uploaded_by: null,
    created_at: "2026-07-22T00:00:00Z",
    ...over,
  };
}

describe("groupDocumentsByObligation", () => {
  it("returns an empty map for an empty list", () => {
    const map = groupDocumentsByObligation([]);
    expect(map.size).toBe(0);
  });

  it("groups documents by their obligation id", () => {
    const a1 = doc({ id: "a1", obligation_id: "o1" });
    const a2 = doc({ id: "a2", obligation_id: "o1" });
    const b1 = doc({ id: "b1", obligation_id: "o2" });

    const map = groupDocumentsByObligation([a1, b1, a2]);

    expect(map.size).toBe(2);
    expect(map.get("o1")).toEqual([a1, a2]);
    expect(map.get("o2")).toEqual([b1]);
    expect(map.get("missing")).toBeUndefined();
  });

  it("preserves input order within each obligation group", () => {
    const first = doc({ id: "first", obligation_id: "o1", created_at: "2026-07-22T10:00:00Z" });
    const second = doc({ id: "second", obligation_id: "o1", created_at: "2026-07-21T10:00:00Z" });

    const map = groupDocumentsByObligation([first, second]);

    expect(map.get("o1")?.map((d) => d.id)).toEqual(["first", "second"]);
  });
});
