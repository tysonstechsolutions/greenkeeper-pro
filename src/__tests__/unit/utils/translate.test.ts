import { describe, it, expect } from "vitest";
import { getLocalized } from "@/lib/utils/localized-text";

describe("getLocalized", () => {
  it("returns the Spanish field when locale is 'es' and *_es is populated", () => {
    const row = { title: "Mow greens", title_es: "Cortar greens" };
    expect(getLocalized(row, "title", "es")).toBe("Cortar greens");
  });

  it("returns the English field when locale is 'es' but *_es is missing", () => {
    const row = { title: "Mow greens" };
    expect(getLocalized(row, "title", "es")).toBe("Mow greens");
  });

  it("returns the English field when locale is 'es' but *_es is null", () => {
    const row = { title: "Mow greens", title_es: null };
    expect(getLocalized(row, "title", "es")).toBe("Mow greens");
  });

  it("returns the English field when locale is 'es' but *_es is an empty string", () => {
    const row = { title: "Mow greens", title_es: "" };
    expect(getLocalized(row, "title", "es")).toBe("Mow greens");
  });

  it("always returns the English field when locale is 'en', even if *_es exists", () => {
    const row = { title: "Mow greens", title_es: "Cortar greens" };
    expect(getLocalized(row, "title", "en")).toBe("Mow greens");
  });

  it("returns empty string when the base field is null/undefined and no translation exists", () => {
    const row = { title: null };
    expect(getLocalized(row, "title", "es")).toBe("");
    expect(getLocalized(row, "title", "en")).toBe("");
  });

  it("works for other fields like description and body", () => {
    const task = { description: "Cut at 0.110\"", description_es: "Cortar a 0.110\"" };
    expect(getLocalized(task, "description", "es")).toBe("Cortar a 0.110\"");
    expect(getLocalized(task, "description", "en")).toBe("Cut at 0.110\"");

    const message = { body: "Hello team", body_es: "Hola equipo" };
    expect(getLocalized(message, "body", "es")).toBe("Hola equipo");
  });
});
