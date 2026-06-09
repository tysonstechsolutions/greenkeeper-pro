/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  flagsAccepted,
  nextStatus,
  prevStatus,
  stageDateField,
  stageDatePatch,
  REVIEW_ORDER,
} from "@/lib/pr-audit/lifecycle";

describe("flagsAccepted", () => {
  it("is true once a PR is sent up or beyond (flags are accepted)", () => {
    expect(flagsAccepted("sent_up")).toBe(true);
    expect(flagsAccepted("approved")).toBe(true);
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
  it("walks the forward chain through the new approved stage", () => {
    expect(REVIEW_ORDER).toEqual([
      "pending",
      "sent_up",
      "approved",
      "ordered",
      "received",
      "receipt_signed",
    ]);
    expect(nextStatus("pending")).toBe("sent_up");
    expect(nextStatus("sent_up")).toBe("approved");
    expect(nextStatus("approved")).toBe("ordered");
    expect(nextStatus("receipt_signed")).toBeNull();
    expect(prevStatus("ordered")).toBe("approved");
    expect(prevStatus("pending")).toBeNull();
  });
  it("brings a bounced PR back into the flow", () => {
    expect(nextStatus("sent_back")).toBe("pending");
  });
});

describe("stageDateField", () => {
  it("maps each stage to its date column (null for pending)", () => {
    expect(stageDateField("pending")).toBeNull();
    expect(stageDateField("sent_up")).toBe("sent_up_date");
    expect(stageDateField("approved")).toBe("approved_date");
    expect(stageDateField("ordered")).toBe("ordered_date");
    expect(stageDateField("received")).toBe("received_date");
    expect(stageDateField("receipt_signed")).toBe("receipt_signed_date");
    expect(stageDateField("sent_back")).toBe("sent_back_date");
  });
});

describe("stageDatePatch", () => {
  it("stamps the stage's date when it's empty", () => {
    expect(stageDatePatch({}, "ordered", "2026-06-10")).toEqual({
      ordered_date: "2026-06-10",
    });
  });
  it("never overwrites an already-set (e.g. back-dated) date", () => {
    expect(stageDatePatch({ ordered_date: "2026-05-01" }, "ordered", "2026-06-10")).toEqual({});
  });
  it("returns nothing for pending (uploaded = created_at)", () => {
    expect(stageDatePatch({}, "pending", "2026-06-10")).toEqual({});
  });
});
