import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { generatePin, pinProblem } from "@/lib/auth/pins";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/settings/pins",
  useSearchParams: () => new URLSearchParams(""),
}));
const auth = vi.hoisted(() => ({ role: "gm" }));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "gm1" },
    profile: { id: "gm1", role: auth.role },
    loading: false,
    isSuper: auth.role === "super",
    isAsstSuper: auth.role === "asst_super",
    isGM: auth.role === "gm",
    isFbManager: auth.role === "fb_manager",
    isManager: ["super", "asst_super", "gm", "pro", "director"].includes(auth.role),
  }),
}));

const db = vi.hoisted(() => ({
  pins: [] as { id: string; user_id: string; pin: string; is_active: boolean }[],
  staff: [] as { id: string; full_name: string; role: string; email: string }[],
  patches: [] as { id: string; patch: Record<string, unknown> }[],
  inserts: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/supabase/rest", () => ({
  directSelectList: async (table: string) => (table === "pin_codes" ? db.pins.map((p) => ({ ...p })) : db.staff),
  directPatchRow: async (_t: string, _c: string, id: string, patch: Record<string, unknown>) => {
    db.patches.push({ id, patch });
    db.pins = db.pins.map((p) => (p.id === id ? { ...p, ...patch } : p));
  },
  directInsertRow: async (_t: string, row: Record<string, unknown>) => {
    db.inserts.push(row);
    db.pins.push({ id: `p${db.pins.length + 1}`, ...(row as { user_id: string; pin: string; is_active: boolean }) });
    return row;
  },
  directDeleteRow: async () => undefined,
}));

beforeEach(() => {
  auth.role = "gm";
  db.pins = [
    { id: "p1", user_id: "b1", pin: "1234", is_active: true },
    { id: "p2", user_id: "c1", pin: "5555", is_active: true },
  ];
  db.staff = [
    { id: "b1", full_name: "Brittany", role: "fb_manager", email: "b@x" },
    { id: "c1", full_name: "Crew One", role: "crew", email: "c@x" },
    { id: "s1", full_name: "Shop Pro", role: "pro", email: "s@x" },
  ];
  db.patches = [];
  db.inserts = [];
});

async function renderPage() {
  const { default: Page } = await import("@/app/settings/pins/page");
  return render(<Page />);
}

describe("PIN rules", () => {
  it("never hands out a PIN someone already has", () => {
    const taken = new Set(Array.from({ length: 8999 }, (_, i) => String(1000 + i)));
    expect(generatePin(taken)).toBe("9999");
    expect(generatePin()).toMatch(/^\d{4}$/);
  });

  it("takes 4 to 6 digits nobody else has", () => {
    expect(pinProblem("2468", new Set(["1234"]))).toBeNull();
    expect(pinProblem("123456", new Set())).toBeNull();
    expect(pinProblem("123", new Set())).toBe("A PIN is 4 to 6 digits.");
    expect(pinProblem("12a4", new Set())).toBe("A PIN is 4 to 6 digits.");
    expect(pinProblem("1234", new Set(["1234"]))).toBe("Someone else already has that PIN. Pick another.");
  });
});

describe("PIN Management page", () => {
  it("lets the GM see everyone's PIN, the F&B Manager's included", async () => {
    await renderPage();
    const row = (await screen.findByText("Brittany")).closest(".p-4")!;
    expect(within(row as HTMLElement).getByText("F&B Manager")).toBeTruthy();
    expect(row.textContent).toContain("••••");
    fireEvent.click(screen.getByRole("button", { name: /Show PINs/ }));
    expect(row.textContent).toContain("1234");
    // Anyone without a PIN can get one, not just the crew.
    expect(screen.getByText("Staff Without PINs (1)")).toBeTruthy();
    expect(screen.getByText("Shop Pro")).toBeTruthy();
  });

  it("sets a PIN the GM picks, and refuses one that's taken or too short", async () => {
    await renderPage();
    await screen.findByText("Brittany");
    fireEvent.click(screen.getByRole("button", { name: "Set PIN for Brittany" }));
    const input = screen.getByLabelText("New PIN for Brittany") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "5555" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Someone else already has that PIN. Pick another.")).toBeTruthy();

    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("A PIN is 4 to 6 digits.")).toBeTruthy();
    expect(db.patches).toEqual([]);

    // Letters are dropped as they're typed.
    fireEvent.change(input, { target: { value: "24a68" } });
    expect(input.value).toBe("2468");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(db.patches).toEqual([{ id: "p1", patch: { pin: "2468" } }]));
    expect(await screen.findByText("Brittany PIN is now 2468")).toBeTruthy();
  });

  it("gives a new random PIN that nobody else has", async () => {
    await renderPage();
    await screen.findByText("Brittany");
    fireEvent.click(screen.getByRole("button", { name: "Create PIN" }));
    await waitFor(() => expect(db.inserts).toHaveLength(1));
    expect(db.inserts[0]).toMatchObject({ user_id: "s1", is_active: true });
    expect(["1234", "5555"]).not.toContain(db.inserts[0].pin);
  });

  it.each(["super", "asst_super"])("works for the %s too", async (role) => {
    auth.role = role;
    await renderPage();
    expect(await screen.findByText("Brittany")).toBeTruthy();
  });

  it.each(["fb_manager", "pro", "director", "crew"])("is closed to the %s", async (role) => {
    auth.role = role;
    await renderPage();
    expect(screen.getByText(/You don't have permission to manage PINs/)).toBeTruthy();
  });
});

describe("PIN access in the database", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261013120000_gm_manages_pins.sql"), "utf8");

  it("adds the GM to every PIN policy and nobody else", () => {
    const roles = sql.match(/role IN \(([^)]+)\)/g)!;
    expect(roles).toHaveLength(5); // read, insert, update (using + check), delete
    for (const r of roles) expect(r).toBe("role IN ('super', 'asst_super', 'gm')");
    expect(sql).not.toMatch(/TO anon/);
    expect(sql).not.toMatch(/\bDO\s+\$/);
  });
});
