// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildSf52DocMeta, parseSf52DocMeta } from "@/lib/sf52/doc-meta";
import { EMPTY_SF52_INPUTS } from "@/lib/sf52/actions";

describe("SF-52 saved-doc meta round-trip", () => {
  it("stores and restores the form inputs", () => {
    const inputs = { ...EMPTY_SF52_INPUTS, box1: "Resignation", reasonForResign: "Line 1\nLine 2" };
    const meta = buildSf52DocMeta({ actionKey: "resignation", employeeId: "abc-123", inputs });
    // Keeps the legacy keys for older consumers.
    expect(meta.action).toBe("resignation");
    expect(meta.employee_id).toBe("abc-123");

    const parsed = parseSf52DocMeta(meta);
    expect(parsed).not.toBeNull();
    expect(parsed!.actionKey).toBe("resignation");
    expect(parsed!.employeeId).toBe("abc-123");
    expect(parsed!.inputs.box1).toBe("Resignation");
    expect(parsed!.inputs.reasonForResign).toBe("Line 1\nLine 2");
  });

  it("fills fields added after the doc was saved with defaults", () => {
    const meta = buildSf52DocMeta({
      actionKey: "recruitment",
      employeeId: "",
      inputs: { ...EMPTY_SF52_INPUTS },
    });
    // Simulate an older doc whose inputs predate a newer field.
    delete ((meta.form as { inputs: Record<string, unknown> }).inputs as Record<string, unknown>).orgUnit;
    const parsed = parseSf52DocMeta(meta);
    expect(parsed!.inputs.orgUnit).toBe(EMPTY_SF52_INPUTS.orgUnit);
  });

  it("returns null for docs without form data (pre-feature saves)", () => {
    expect(parseSf52DocMeta({ action: "resignation", employee_id: null })).toBeNull();
    expect(parseSf52DocMeta(null)).toBeNull();
    expect(parseSf52DocMeta({ form: "garbage" })).toBeNull();
  });
});
