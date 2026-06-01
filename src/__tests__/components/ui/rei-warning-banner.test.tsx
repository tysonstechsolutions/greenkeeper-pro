import { describe, it, expect } from "vitest";
import { render, screen } from "../../utils/test-utils";
import { REIWarningBanner } from "@/components/features/chemicals/rei-warning-banner";
import type { REIZoneInfo } from "@/lib/utils/rei-conflicts";

const conflict = (over: Partial<REIZoneInfo>): REIZoneInfo => ({
  application_id: "app-1",
  product_name: "Primo Maxx",
  zone_ids: ["green-3"],
  hole_numbers: [3],
  rei_expires_at: "2026-06-01T18:00:00Z",
  hours_remaining: 4,
  ...over,
});

describe("REIWarningBanner", () => {
  it("renders nothing when there are no conflicts", () => {
    const { container } = render(<REIWarningBanner conflicts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the restricted-entry heading when conflicts exist", () => {
    render(<REIWarningBanner conflicts={[conflict({})]} />);
    expect(screen.getByText(/restricted entry interval/i)).toBeInTheDocument();
  });

  it("lists the conflicting product name", () => {
    render(
      <REIWarningBanner
        conflicts={[conflict({ product_name: "Daconil Action" })]}
      />,
    );
    expect(screen.getByText(/daconil action/i)).toBeInTheDocument();
  });

  it("shows the hours remaining for a conflict", () => {
    render(<REIWarningBanner conflicts={[conflict({ hours_remaining: 12 })]} />);
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it("renders one row per conflicting application", () => {
    render(
      <REIWarningBanner
        conflicts={[
          conflict({ application_id: "a", product_name: "Primo Maxx" }),
          conflict({ application_id: "b", product_name: "Daconil Action" }),
        ]}
      />,
    );
    expect(screen.getByText(/primo maxx/i)).toBeInTheDocument();
    expect(screen.getByText(/daconil action/i)).toBeInTheDocument();
  });

  it("exposes an alert role for assistive tech", () => {
    render(<REIWarningBanner conflicts={[conflict({})]} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
