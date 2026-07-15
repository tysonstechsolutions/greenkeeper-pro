import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrStageTracker } from "@/components/features/purchase-requests/pr-stage-tracker";

describe("PrStageTracker", () => {
  it("names every stage, including Complete", () => {
    render(<PrStageTracker status="sent" />);
    for (const label of [
      "Draft",
      "Not Sent",
      "Sent",
      "Approved",
      "Received",
      "Complete",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the current stage (no hover required)", () => {
    const { container } = render(<PrStageTracker status="sent" />);
    const current = container.querySelector('[aria-current="step"]');
    expect(current).not.toBeNull();
    // 'sent' is stage 3 of 6 — the current dot shows its number.
    expect(current?.textContent).toBe("3");
  });

  it("exposes the position to screen readers", () => {
    render(<PrStageTracker status="approved" />);
    expect(
      screen.getByLabelText("Stage 4 of 6: Approved"),
    ).toBeInTheDocument();
  });

  // Complete comes from completed_at, not status: a received-but-unsettled PR
  // sits at 5 with Complete still ahead of it.
  it("shows Complete as the step still ahead when received but not settled", () => {
    render(<PrStageTracker status="received" completed={false} />);
    expect(
      screen.getByLabelText("Stage 5 of 6: Received"),
    ).toBeInTheDocument();
  });

  it("advances to Complete once the purchase is settled", () => {
    render(<PrStageTracker status="received" completed />);
    expect(
      screen.getByLabelText("Stage 6 of 6: Complete"),
    ).toBeInTheDocument();
  });

  it("renders nothing for an unknown status", () => {
    const { container } = render(
      <PrStageTracker status={"bogus" as never} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
