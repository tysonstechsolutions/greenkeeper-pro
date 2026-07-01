import { describe, it, expect } from "vitest";
import { defaultDispositionReason, usesPhotoReason } from "@/lib/dd-forms/reasons";

describe("defaultDispositionReason", () => {
  it("gives the specific lost wording", () => {
    expect(defaultDispositionReason("lost")).toMatch(/cannot be located on the grounds/i);
    expect(defaultDispositionReason("lost")).toMatch(/no record/i);
  });
  it("gives damaged and destroyed wording beyond 'beyond economical repair' alone", () => {
    expect(defaultDispositionReason("damaged")).toMatch(/damaged/i);
    expect(defaultDispositionReason("destroyed")).toMatch(/destroyed/i);
  });
});

describe("usesPhotoReason", () => {
  it("is true for damaged/destroyed, false for lost", () => {
    expect(usesPhotoReason("damaged")).toBe(true);
    expect(usesPhotoReason("destroyed")).toBe(true);
    expect(usesPhotoReason("lost")).toBe(false);
  });
});
