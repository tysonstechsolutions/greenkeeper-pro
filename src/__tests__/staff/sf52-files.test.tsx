import { beforeEach, describe, expect, it, vi } from "vitest";
import { FB_DEPARTMENT } from "@/lib/auth/fb-manager";
import { fireEvent, render, screen, waitFor, within } from "../utils/test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/staff/sf52/files",
  useSearchParams: () => new URLSearchParams(""),
}));
const auth = vi.hoisted(() => ({ profile: { id: "gm1", full_name: "Tyson Bruce", role: "gm" } as { id: string; full_name: string; role: string } }));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ profile: auth.profile, user: { id: auth.profile.id } }) }));
vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>("@/components/auth/role-guard");
  return { ...actual, RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

const db = vi.hoisted(() => ({
  profiles: [] as Record<string, unknown>[],
  docs: [] as Record<string, unknown>[],
  uploads: [] as { bucket: string; path: string; name: string }[],
  inserted: [] as Record<string, unknown>[],
  deleted: [] as string[],
}));
vi.mock("@/lib/supabase/rest", () => ({
  getCachedUserId: () => auth.profile.id,
  directSelectList: async (table: string) => (table === "profiles" ? db.profiles : db.docs),
  directStorageUpload: async (bucket: string, path: string, file: File) => {
    db.uploads.push({ bucket, path, name: file.name });
    return path;
  },
  directInsertRow: async (_table: string, row: Record<string, unknown>) => {
    db.inserted.push(row);
    db.docs = [{ id: `d${db.docs.length + 1}`, created_at: "2026-10-08T15:00:00Z", file_type: "application/pdf", ...row }, ...db.docs];
    return row;
  },
  directDeleteRow: async (_t: string, _c: string, id: string) => {
    db.deleted.push(id);
    db.docs = db.docs.filter((d) => d.id !== id);
  },
  directStorageDelete: async () => undefined,
  directCreateSignedUrl: async () => "https://signed.example/sf52.pdf",
}));

beforeEach(() => {
  auth.profile = { id: "gm1", full_name: "Tyson Bruce", role: "gm" };
  db.profiles = [
    { id: "gm1", full_name: "Tyson Bruce", role: "gm", department: "Golf", is_active: true },
    { id: "a", full_name: "Amy Cook", role: "crew", department: FB_DEPARTMENT, is_active: true },
    { id: "b", full_name: "Ben Mower", role: "crew", department: "Maintenance", is_active: true },
  ];
  db.docs = [{ id: "d0", employee_id: "b", name: "SF-52 Other action – pay.pdf", category: "sf52", storage_path: "b/1-sf52-pay.pdf", file_type: "application/pdf", created_at: "2026-09-01T15:00:00Z" }];
  db.uploads = [];
  db.inserted = [];
  db.deleted = [];
});

async function renderPage() {
  const { default: Page } = await import("@/app/staff/sf52/files/page");
  return render(<Page />);
}

describe("SF-52 Files page", () => {
  it("lists every employee (not the viewer) with the SF-52s on file", async () => {
    await renderPage();
    const list = await screen.findByRole("list", { name: "Employees" });
    expect(within(list).getByText("Amy Cook")).toBeInTheDocument();
    expect(within(list).getByText("Ben Mower")).toBeInTheDocument();
    expect(within(list).queryByText("Tyson Bruce")).toBeNull();
    const bens = screen.getByRole("list", { name: "Ben Mower's SF-52s" });
    expect(bens).toHaveTextContent("Other action");
    expect(bens).toHaveTextContent("filed Sep 1, 2026");
    expect(bens).not.toHaveTextContent("off the evaluation lists");
    expect(screen.getByText(/2 employees · 0 leaving/)).toBeInTheDocument();
  });

  it("files a resignation SF-52 and says the person is off the evaluation lists", async () => {
    await renderPage();
    await screen.findByRole("list", { name: "Employees" });
    const amy = screen.getByText("Amy Cook").closest("li")!;
    fireEvent.click(within(amy).getByRole("button", { name: /Upload SF-52/ }));
    const panel = screen.getByLabelText("Upload SF-52 for Amy Cook");
    const upload = within(panel).getByRole("button", { name: "Upload" });
    expect(upload).toBeDisabled();
    fireEvent.click(within(panel).getByText("Resignation"));
    expect(panel).toHaveTextContent("Amy Cook comes off the year-end and 90-day evaluation lists.");
    fireEvent.change(within(panel).getByLabelText("SF-52 file for Amy Cook"), {
      target: { files: [new File(["%PDF"], "amy resign.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(upload);

    expect(await screen.findByText("Filed Amy Cook's resignation SF-52. Amy Cook is off the evaluation lists.")).toBeInTheDocument();
    expect(db.uploads[0].bucket).toBe("staff-documents");
    expect(db.uploads[0].path).toMatch(/^a\/\d+-sf52-amy_resign\.pdf$/);
    expect(db.inserted[0]).toMatchObject({ employee_id: "a", category: "sf52_resignation", name: "SF-52 Resignation – amy resign.pdf", file_type: "application/pdf" });
    const amys = await screen.findByRole("list", { name: "Amy Cook's SF-52s" });
    expect(amys).toHaveTextContent("Resignation");
    expect(amys).toHaveTextContent("off the evaluation lists");
    expect(screen.getByText(/2 employees · 1 leaving/)).toBeInTheDocument();
  });

  it("removes an SF-52 filed by mistake", async () => {
    window.confirm = vi.fn(() => true);
    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Ben Mower's SF-52 from Sep 1, 2026" }));
    await waitFor(() => expect(db.deleted).toEqual(["d0"]));
    expect(await screen.findByText("Removed the SF-52 from Ben Mower's file.")).toBeInTheDocument();
  });

  it("shows the F&B Manager only Food & Beverage staff", async () => {
    auth.profile = { id: "fb1", full_name: "Brittany Flament", role: "fb_manager" };
    await renderPage();
    const list = await screen.findByRole("list", { name: "Employees" });
    expect(within(list).getByText("Amy Cook")).toBeInTheDocument();
    expect(within(list).queryByText("Ben Mower")).toBeNull();
  });
});
