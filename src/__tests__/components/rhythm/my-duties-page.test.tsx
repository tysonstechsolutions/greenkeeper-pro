import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Obligation, ObligationCompletion } from "@/lib/operations/types";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

// ── Mocks ───────────────────────────────────────────────────────────────────

const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "me" }, isManager: true }),
}));

vi.mock("@/lib/usage/track", () => ({ trackAction: vi.fn() }));

const directInsertRow = vi.fn().mockResolvedValue({});
const directPatchRow = vi.fn().mockResolvedValue(undefined);
const directSelectAll = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/supabase/rest", () => ({
  directInsertRow: (...args: unknown[]) => directInsertRow(...args),
  directPatchRow: (...args: unknown[]) => directPatchRow(...args),
  directSelectAll: (...args: unknown[]) => directSelectAll(...args),
}));

const completeObligation = vi.fn().mockResolvedValue(undefined);
const uncompleteObligation = vi.fn().mockResolvedValue(undefined);
const reload = vi.fn();
let obligations: Obligation[] = [];
let completions: ObligationCompletion[] = [];
vi.mock("@/lib/operations/use-operations", () => ({
  useOperations: () => ({
    loading: false,
    error: null,
    reload,
    evaluated: [],
    obligations,
    completions,
    dutiesToday: [],
    allDuties: [],
    canUndoObligations: true,
    completeObligation,
    uncompleteObligation,
    toggleDuty: vi.fn(),
    transitionDuty: vi.fn(),
    today: "2026-10-08",
  }),
}));

const transition = vi.fn().mockResolvedValue(undefined);
let workItems: OperationalWorkItem[] = [];
vi.mock("@/lib/operational-work/use-operational-work", () => ({
  useOperationalWork: () => ({ items: workItems, loading: false, error: null, transition }),
}));

import MyDutiesPage from "@/app/my-duties/page";

// ── Fixtures ────────────────────────────────────────────────────────────────

function ob(partial: Partial<Obligation>): Obligation {
  return {
    id: "ob", slug: "ob", title: "Obligation", detail: null, workspace: "general",
    cadence: "monthly", due_day: 1, due_month: null, due_weekday: null, lead_days: 0,
    delegable: true, link_href: null, is_active: true, notes: null, sort_order: 0,
    created_at: "2026-09-01T12:00:00", effective_from: null, updated_at: "2026-09-01T12:00:00",
    ...partial,
  };
}

function completion(obligationId: string, period: string): ObligationCompletion {
  return { id: `${obligationId}-${period}`, obligation_id: obligationId, period, completed_at: "", completed_by: null, note: null };
}

function work(partial: Partial<OperationalWorkItem>): OperationalWorkItem {
  return {
    stableId: "task:t1", sourceType: "task", sourceRecordId: "t1", title: "Task", description: null,
    department: null, responsibleEmployee: null, responsiblePosition: null, accountableManager: null,
    status: "pending", dueDate: null, estimatedMinutes: null, priorityBand: "normal", priorityScore: 0,
    priorityExplanation: [], blockedState: { blocked: false, blockerKeys: [], reason: null },
    delegated: false, delegationStatus: null,
    leadershipState: { active: false, status: null, followUpDate: null, followUpDue: false, recipient: null },
    verificationState: "not_required", aiCapabilityState: "unknown", destinationRoute: "/tasks/view?id=t1",
    sourceLabel: "Task", createdAt: "", updatedAt: "", completedAt: null, impactLevel: null,
    managerPriorityOverride: null, safetyFlag: false, complianceFlag: false, payrollDeadlineFlag: false,
    financialDeadlineFlag: false, dependentCount: 0, waitingReason: null, reviewDate: null,
    programStandardId: null, activitySummary: null, dutySeriesKey: null,
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  // Thursday Oct 8 2026. Week = Oct 4 – 10.
  obligations = [
    ob({ id: "walk", title: "Facility walkthrough", cadence: "weekly", due_weekday: 4 }),
    ob({ id: "kronos", title: "Fix Kronos timecards", cadence: "weekly", due_weekday: 1 }),
    ob({ id: "one-on-ones", title: "Monthly 1:1s", cadence: "monthly", due_day: 9, link_href: "/schedule" }),
  ];
  completions = [
    completion("walk", "W2026-08-30"), completion("walk", "W2026-09-06"), completion("walk", "W2026-09-13"),
    completion("walk", "W2026-09-20"), completion("walk", "W2026-09-27"),
    completion("kronos", "W2026-08-30"), completion("kronos", "W2026-09-06"), completion("kronos", "W2026-09-13"),
    // Kronos missed the week of Sep 20 and Sep 27 — catch-up.
    completion("kronos", "W2026-10-04"),
    completion("one-on-ones", "2026-09"),
  ];
  workItems = [
    work({ stableId: "task:mine", title: "Call the irrigation vendor", dueDate: "2026-10-08" }),
    work({ stableId: "task:crew", sourceType: "duty", title: "Mow greens", dueDate: "2026-10-08", responsiblePosition: "maintenance_staff" }),
  ];
});

describe("My Duties page", () => {
  it("opens on Today with catch-up first, today's duty, and only the GM's own work", () => {
    render(<MyDutiesPage />);
    expect(screen.getByRole("heading", { name: "My Duties" })).toBeInTheDocument();

    const catchUp = screen.getByRole("heading", { name: /Catch up first/ }).closest("section")!;
    expect(within(catchUp).getByText("Fix Kronos timecards")).toBeInTheDocument();
    expect(within(catchUp).getByText(/\+1 more behind it/)).toBeInTheDocument();

    const dueToday = screen.getByRole("heading", { name: /Due today/ }).closest("section")!;
    expect(within(dueToday).getByText("Facility walkthrough")).toBeInTheDocument();

    expect(screen.getByText("Call the irrigation vendor")).toBeInTheDocument();
    // Crew duty occurrences live on the printed sheets, not here.
    expect(screen.queryByText("Mow greens")).toBeNull();
    // Due tomorrow with no lead time — not on Today.
    expect(screen.queryByText("Monthly 1:1s")).toBeNull();
  });

  it("checks a duty off for the right period in one tap", async () => {
    const user = userEvent.setup();
    render(<MyDutiesPage />);
    await user.click(screen.getByRole("button", { name: "Mark Facility walkthrough done" }));
    expect(completeObligation).toHaveBeenCalledWith(expect.objectContaining({
      obligation: expect.objectContaining({ id: "walk" }),
      period: "W2026-10-04",
    }));
  });

  it("clears the oldest missed week first", async () => {
    const user = userEvent.setup();
    render(<MyDutiesPage />);
    await user.click(screen.getByRole("button", { name: "Mark Fix Kronos timecards done" }));
    expect(completeObligation).toHaveBeenCalledWith(expect.objectContaining({ period: "W2026-09-20" }));
  });

  it("marks simple work done from the list", async () => {
    const user = userEvent.setup();
    render(<MyDutiesPage />);
    await user.click(screen.getByRole("button", { name: "Mark Call the irrigation vendor done" }));
    expect(transition).toHaveBeenCalledWith("task:mine", "complete");
  });

  it("switches tabs through the URL so back/forward and reloads keep the tab", async () => {
    const user = userEvent.setup();
    render(<MyDutiesPage />);
    await user.click(screen.getByRole("button", { name: /^Week/ }));
    expect(replace).toHaveBeenCalledWith("/my-duties?tab=week", { scroll: false });
  });

  it("shows the week's checklist and the monthly item landing this week", () => {
    searchParams = new URLSearchParams("tab=week");
    render(<MyDutiesPage />);
    const checklist = screen.getByRole("heading", { name: /Every week/ }).closest("section")!;
    expect(within(checklist).getByText("Facility walkthrough")).toBeInTheDocument();
    expect(within(checklist).getByText("Fix Kronos timecards")).toBeInTheDocument();
    const also = screen.getByRole("heading", { name: /Also due this week/ }).closest("section")!;
    expect(within(also).getByText("Monthly 1:1s")).toBeInTheDocument();
    // The retired /schedule link is repaired on the way out.
    expect(within(also).getByRole("link", { name: "Open the page for Monthly 1:1s" })).toHaveAttribute("href", "/pro-shop-schedule");
    // 1 of the 2 weekly duties is done this week.
    expect(screen.getByText(/1 left this week/)).toBeInTheDocument();
  });

  it("adds a recurring duty that starts counting today", async () => {
    const user = userEvent.setup();
    render(<MyDutiesPage />);
    await user.click(screen.getByRole("button", { name: /Add duty/ }));
    await user.type(screen.getByPlaceholderText("e.g. Check fire extinguishers"), "Check fire extinguishers");
    await user.click(screen.getByRole("button", { name: "Every month" }));
    await user.click(screen.getByRole("button", { name: "Add duty" }));
    expect(directInsertRow).toHaveBeenCalledWith(
      "obligations",
      expect.objectContaining({
        title: "Check fire extinguishers",
        cadence: "monthly",
        due_day: 1,
        owner_profile_id: "me",
        effective_from: "2026-10-08",
        is_active: true,
      }),
      "my-duties.insert-obligation",
    );
    expect(reload).toHaveBeenCalled();
  });

  it("asks why before undoing a completion", async () => {
    searchParams = new URLSearchParams("tab=week");
    const user = userEvent.setup();
    render(<MyDutiesPage />);
    await user.click(screen.getByRole("button", { name: "Undo Fix Kronos timecards" }));
    const confirm = screen.getByRole("button", { name: "Undo" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByPlaceholderText("e.g. Checked it off by mistake"), "Wrong week");
    await user.click(confirm);
    expect(uncompleteObligation).toHaveBeenCalledWith("kronos", "W2026-10-04", "Wrong week");
  });
});
