/**
 * The PR form opened from the Buckley's order guide (?prefill=1), and code
 * suggestions learned from earlier PRs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../../utils/test-utils";
import userEvent from "@testing-library/user-event";
import { savePrPrefill } from "@/lib/restaurant/order-guide";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/purchase-requests/new",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    profile: { role: "super", full_name: "Tyson Bruce", display_name: "Tyson", phone: "(847) 555-0100" },
    user: { id: "user-1" },
    loading: false,
  }),
}));

vi.mock("@/lib/hooks/usePartHistory", () => ({
  usePartHistory: () => ({
    entries: [
      {
        key: "desc:range balls yellow",
        description: "Range balls yellow",
        part_number: "",
        unit: "Case",
        unit_price: 300,
        qty: 1,
        vendor: "Range Servant",
        count: 2,
        last_used: "2026-07-15",
        site: "7009",
        cost_ctr: "25224",
        gl_acct: "701000",
      },
    ],
    loading: false,
    total: 1,
    search: () => [],
  }),
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

// The vendor list: one US Foods entry.
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, resolveAccessToken: async () => "token" };
});

beforeEach(() => {
  sessionStorage.clear();
  nav.search = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/rest/v1/vendors")
        ? new Response(JSON.stringify([{ id: "v-usf", name: "US Foods", address: "PO Box 98420", city_state_zip: "Chicago, IL" }]), { status: 200 })
        : new Response("[]", { status: 200 }),
    ),
  );
});

async function openSection(user: ReturnType<typeof userEvent.setup>, title: RegExp) {
  const header = screen.getAllByRole("button").find((b) => title.test(b.textContent ?? ""));
  if (!header) throw new Error(`No section header matching ${title}`);
  await user.click(header);
}

describe("PR form hand-offs", () => {
  it("opens with the order guide's items, vendor, and Buckley's codes", async () => {
    nav.search = "prefill=1";
    savePrPrefill({
      vendorName: "US Foods",
      items: [
        { item: 1, site: "7011", cost_ctr: "20091", gl_acct: "151110", description: "CUCUMBER, FRESH REF · PACKER · 6 EA", part_number: "9015421", qty: 2, unit: "Case", unit_price: 11.3 },
      ],
      justification: "Buckley's resale stock",
    });
    const { default: Page } = await import("@/app/purchase-requests/new/page");
    const user = userEvent.setup();
    render(<Page />);
    await openSection(user, /^Line Items/);
    await waitFor(() =>
      expect(screen.getByDisplayValue("CUCUMBER, FRESH REF · PACKER · 6 EA")).toBeInTheDocument(),
    );
    expect((screen.getByLabelText("Line 1 cost center") as HTMLSelectElement).value).toBe("20091");
    expect((screen.getByLabelText("Line 1 site") as HTMLSelectElement).value).toBe("7011");
    expect((screen.getByLabelText("Line 1 G/L account") as HTMLSelectElement).value).toBe("151110");
    // The hand-off is used once.
    expect(sessionStorage.getItem("gk.prPrefill")).toBeNull();
    await openSection(user, /^Vendor/);
    await waitFor(() => expect(screen.getByDisplayValue("PO Box 98420")).toBeInTheDocument());
  });

  it("suggests the codes an earlier PR used for the same thing", async () => {
    const { default: Page } = await import("@/app/purchase-requests/new/page");
    const user = userEvent.setup();
    render(<Page />);
    await openSection(user, /^Line Items/);
    await user.click(screen.getByRole("button", { name: /Add Line Item/ }));
    const description = screen
      .getAllByPlaceholderText("e.g. Toro Greensmaster 3150 mower blade")
      .find((el) => !el.hasAttribute("readonly")) as HTMLTextAreaElement;
    await user.type(description, "Yellow range balls");
    await user.tab();
    const gl = screen.getByLabelText("Line 1 G/L account") as HTMLSelectElement;
    expect((screen.getByLabelText("Line 1 cost center") as HTMLSelectElement).value).toBe("25224");
    expect(gl.value).toBe("701000");
    expect(screen.queryByRole("button", { name: /Use suggested G\/L account/ })).toBeNull();
  });
});
