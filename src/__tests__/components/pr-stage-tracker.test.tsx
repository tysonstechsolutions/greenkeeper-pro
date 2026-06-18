import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrStageTracker } from "@/components/features/purchase-requests/pr-stage-tracker";

describe("PrStageTracker", () => {
  it("names every stage", () => {
    render(<PrStageTracker status="sent" />);
    for (const label of ["Draft", "Not Sent", "Sent", "Approved", "Received"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the current stage (no hover required)", () => {
    const { container } = render(<PrStageTracker status="sent" />);
    const current = container.querySelector('[aria-current="step"]');
    expect(current).not.toBeNull();
    // 'sent' is stage 3 of 5 — the current dot shows its number.
    expect(current?.textContent).toBe("3");
  });

  it("exposes the position to screen readers", () => {
    render(<PrStageTracker status="approved" />);
    expect(
      screen.getByLabelText("Stage 4 of 5: Approved"),
    ).toBeInTheDocument();
  });

  it("renders nothing for an unknown status", () => {
    const { container } = render(
      <PrStageTracker status={"bogus" as never} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
