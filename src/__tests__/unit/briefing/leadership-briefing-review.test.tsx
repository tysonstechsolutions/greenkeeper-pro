import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  LeadershipBriefingReview,
  type BriefingReviewSelection,
} from "@/components/briefing/leadership-briefing-review";
import { buildBriefing } from "@/lib/briefing/engine";
import {
  PR_COMMITTED_ORDERED_SPEND_LABEL,
  type BriefingData,
  type BriefingSources,
} from "@/lib/briefing/types";

function emptySources(): BriefingSources {
  return {
    revenueRollups: [],
    prSpendRollups: [],
    budgetItems: [],
    purchaseRequests: [],
    equipment: [],
    holeObservations: [],
    obligations: [],
    obligationCompletions: [],
    profiles: [],
    certifications: [],
    workOrders: [],
    restaurantPurchases: [],
    inventoryItems: [],
    capitalProjects: [],
    staffRecords: [],
  };
}

function briefingFor(selection: BriefingReviewSelection, populated = true): BriefingData {
  const sources = emptySources();
  if (populated) {
    sources.revenueRollups = [
      { month: "2026-09-01", category: "green_fees", total: 1500 },
    ];
    sources.prSpendRollups = [
      { month: "2026-09-01", cost_ctr: "11000", total: 400 },
    ];
  }
  return buildBriefing(sources, {
    asOf: "2026-09-30",
    generatedAt: "2026-09-30T17:00:00.000Z",
    period: selection,
  });
}

function renderReview(populated = true) {
  const loadBriefing = vi.fn(async (selection: BriefingReviewSelection) =>
    briefingFor(selection, populated),
  );
  const onExport = vi.fn(async () => undefined);
  const onSave = vi.fn(async () => undefined);
  render(
    <LeadershipBriefingReview
      initialAnchor="2026-09-30"
      loadBriefing={loadBriefing}
      onExport={onExport}
      onSave={onSave}
    />,
  );
  return { loadBriefing, onExport, onSave };
}

describe("LeadershipBriefingReview", () => {
  it("loads a quarterly briefing by default and renders recorded values", async () => {
    const { loadBriefing } = renderReview();

    await screen.findByLabelText("Briefing preview");

    expect(screen.getByRole("combobox", { name: "Briefing cadence" })).toHaveValue(
      "quarterly",
    );
    expect(loadBriefing).toHaveBeenCalledWith({
      kind: "quarterly",
      anchor: "2026-09-30",
    });
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
    expect(screen.getAllByText("$400.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText(PR_COMMITTED_ORDERED_SPEND_LABEL).length).toBeGreaterThan(0);
  });

  it("allows a monthly selection without calculating facts in the component", async () => {
    const user = userEvent.setup();
    const { loadBriefing } = renderReview();
    await screen.findByLabelText("Briefing preview");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Briefing cadence" }),
      "monthly",
    );

    await waitFor(() => {
      expect(loadBriefing).toHaveBeenLastCalledWith({
        kind: "monthly",
        anchor: "2026-09-30",
      });
    });
  });

  it("renders unavailable values as engine-provided availability states, never as zero", async () => {
    renderReview(true);
    await screen.findByLabelText("Briefing preview");

    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Insufficient history").length).toBeGreaterThan(0);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("keeps export and save disabled until an explicit approval action", async () => {
    const user = userEvent.setup();
    const { onExport, onSave } = renderReview();
    await screen.findByLabelText("Briefing preview");

    const exportButton = screen.getByRole("button", { name: "Export PDF" });
    const saveButton = screen.getByRole("button", { name: "Save approved PDF" });
    expect(exportButton).toBeDisabled();
    expect(saveButton).toBeDisabled();
    expect(screen.getByText(/Preview is available now/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Approve briefing for final PDF" }),
    );

    expect(screen.getByText("Approved for final PDF")).toBeInTheDocument();
    expect(exportButton).toBeEnabled();
    expect(saveButton).toBeEnabled();

    await user.click(exportButton);
    await user.click(saveButton);

    await waitFor(() => {
      expect(onExport).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onExport).toHaveBeenLastCalledWith(expect.anything(), true);
    expect(onSave).toHaveBeenLastCalledWith(expect.anything(), true);
  });

  it("does not fabricate a zero-valued financial display for fully empty sources", async () => {
    renderReview(false);
    await screen.findByLabelText("Briefing preview");

    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });
});
