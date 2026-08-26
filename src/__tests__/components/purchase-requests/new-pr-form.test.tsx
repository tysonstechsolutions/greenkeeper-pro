/**
 * Behaviour of the new Purchase Request form: the Request Via choices, the
 * required-delivery-date default, the quote-filename auto-fill, and being
 * able to delete (and restore) the credit-card fee line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "../../utils/test-utils";
import userEvent from "@testing-library/user-event";
import { PR_DELIVERY_DAYS } from "@/lib/pr-defaults";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/purchase-requests/new",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    profile: {
      role: "super",
      full_name: "Tyson Bruce",
      display_name: "Tyson",
      phone: "(847) 555-0100",
      email: "kiosk@example.com",
    },
    user: { id: "user-1" },
    loading: false,
  }),
}));

// The vendor picker and part history hit the network; keep them empty.
vi.mock("@/lib/hooks/usePartHistory", () => ({
  usePartHistory: () => ({ entries: [], loading: false, refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        order: async () => ({ data: [], error: null }),
      }),
    }),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}));

// Monday 2026-08-24, midday — well clear of a month boundary.
const FIXED = new Date(2026, 7, 24, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderForm() {
  const { default: Page } = await import("@/app/purchase-requests/new/page");
  const user = userEvent.setup({
    advanceTimers: vi.advanceTimersByTime.bind(vi),
  });
  const utils = render(<Page />);
  return { ...utils, user };
}

/**
 * Open a collapsible section by its header. Only one is open at a time, so
 * every read has to open its own section first.
 */
async function openSection(
  user: ReturnType<typeof userEvent.setup>,
  title: string | RegExp,
) {
  const header = screen
    .getAllByRole("button")
    .find((b) =>
      typeof title === "string"
        ? b.textContent?.trim() === title
        : title.test(b.textContent ?? ""),
    );
  if (!header) throw new Error(`No section header matching ${title}`);
  await user.click(header);
}

/**
 * The control under a `Field` label. The form's Field component renders a
 * bare <label> that isn't wired to its input, so getByLabelText can't find
 * these — walk from the label to its sibling control instead.
 */
function fieldControl(label: string): HTMLInputElement | HTMLTextAreaElement {
  const el = screen.getByText(label, { selector: "label" });
  const control = el.parentElement?.querySelector("input, textarea");
  if (!control) throw new Error(`No control under the "${label}" label`);
  return control as HTMLInputElement | HTMLTextAreaElement;
}

describe("Request Via", () => {
  it("offers all three routes", async () => {
    await renderForm();
    for (const label of ["Contracting Office", "Purchase Card", "Check"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("starts on Purchase Card and moves the selection when Check is picked", async () => {
    const { user } = await renderForm();
    const card = screen.getByRole("button", { name: "Purchase Card" });
    const check = screen.getByRole("button", { name: "Check" });
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(check).toHaveAttribute("aria-pressed", "false");

    await user.click(check);

    expect(screen.getByRole("button", { name: "Check" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Purchase Card" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

describe("required delivery date", () => {
  it("defaults to a week after the prepared date", async () => {
    const { user } = await renderForm();
    await openSection(user, /^Header/);

    expect(fieldControl("Date Prepared")).toHaveValue("2026-08-24");
    expect(fieldControl("Required Delivery Date")).toHaveValue("2026-08-31");
    expect(PR_DELIVERY_DAYS).toBe(7);
  });

  it("follows the prepared date when that changes", async () => {
    const { user } = await renderForm();
    await openSection(user, /^Header/);

    await user.clear(fieldControl("Date Prepared"));
    await user.type(fieldControl("Date Prepared"), "2026-09-10");

    expect(fieldControl("Required Delivery Date")).toHaveValue("2026-09-17");
  });

  it("stops following once the requestor sets a date themselves", async () => {
    const { user } = await renderForm();
    await openSection(user, /^Header/);

    await user.clear(fieldControl("Required Delivery Date"));
    await user.type(fieldControl("Required Delivery Date"), "2026-10-01");

    await user.clear(fieldControl("Date Prepared"));
    await user.type(fieldControl("Date Prepared"), "2026-09-10");

    expect(fieldControl("Required Delivery Date")).toHaveValue("2026-10-01");
  });
});

describe("credit card fee line", () => {
  it("starts on the request and can be deleted", async () => {
    const { user } = await renderForm();
    await openSection(user, /^Line Items/);

    expect(screen.getByText("3% Credit Card Fee")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Remove credit card fee" }),
    );

    expect(screen.queryByText("3% Credit Card Fee")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove credit card fee" }),
    ).not.toBeInTheDocument();
  });

  it("stays gone — the rebalance doesn't put it back", async () => {
    const { user } = await renderForm();
    await openSection(user, /^Line Items/);
    await user.click(
      screen.getByRole("button", { name: "Remove credit card fee" }),
    );

    // Adding a line is what triggers the fee recalculation.
    await user.click(screen.getByRole("button", { name: /Add Line Item/ }));

    expect(screen.queryByText("3% Credit Card Fee")).not.toBeInTheDocument();
  });

  it("can be added back", async () => {
    const { user } = await renderForm();
    await openSection(user, /^Line Items/);
    await user.click(
      screen.getByRole("button", { name: "Remove credit card fee" }),
    );

    await user.click(
      screen.getByRole("button", { name: /Add 3% Credit Card Fee/ }),
    );

    expect(screen.getByText("3% Credit Card Fee")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add 3% Credit Card Fee/ }),
    ).not.toBeInTheDocument();
  });
});

describe("IGE Based On / Other attachment", () => {
  it("carries the quote's filename, not the methodology label", async () => {
    const { user } = await renderForm();

    // Vendor 1's name feeds the filename.
    await openSection(user, "Vendor 1 (primary)");
    await user.type(fieldControl("Vendor Name"), "Ace Hardware");

    // "####" stands in for the sequence number the database assigns on save.
    const expected = "QUOTE-FY26-GC-####-AceHardware-Golf Course-August2026";

    await openSection(user, "IGE & Justification");
    expect(fieldControl("IGE Based On")).toHaveValue(expected);

    await openSection(user, "Attached Items");
    expect(fieldControl("Other (specify)")).toHaveValue(expected);
  });
});
