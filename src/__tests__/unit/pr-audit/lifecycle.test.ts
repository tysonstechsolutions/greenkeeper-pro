/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { flagsAccepted, nextStatus, prevStatus } from "@/lib/pr-audit/lifecycle";

describe("flagsAccepted", () => {
  it("is true once a PR is sent up or beyond (flags are accepted)", () => {
    expect(flagsAccepted("sent_up")).toBe(true);
    expect(flagsAccepted("ordered")).toBe(true);
    expect(flagsAccepted("received")).toBe(true);
    expect(flagsAccepted("receipt_signed")).toBe(true);
  });

  it("is false while pending or sent back (flags still matter)", () => {
    expect(flagsAccepted("pending")).toBe(false);
    expect(flagsAccepted("sent_back")).toBe(false);
  });
});

describe("nextStatus / prevStatus", () => {
  it("walks the forward chain", () => {
    expect(nextStatus("pending")).toBe("sent_up");
    expect(nextStatus("receipt_signed")).toBeNull();
    expect(prevStatus("sent_up")).toBe("pending");
    expect(prevStatus("pending")).toBeNull();
  });
  it("brings a bounced PR back into the flow", () => {
    expect(nextStatus("sent_back")).toBe("pending");
  });
});
