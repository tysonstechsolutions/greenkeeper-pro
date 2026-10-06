import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CodePicker } from "@/components/accounting/code-picker";

describe("CodePicker", () => {
  it("lists the most-used codes first, then every official code by group", () => {
    render(<CodePicker kind="cost_center" value="" onChange={() => {}} emptyLabel="— pick —" ariaLabel="Cost center" />);
    const select = screen.getByLabelText("Cost center") as HTMLSelectElement;
    const groups = Array.from(select.querySelectorAll("optgroup")).map((g) => g.label);
    expect(groups[0]).toBe("Most used");
    expect(groups).toEqual(expect.arrayContaining(["G/A", "MWR LIBRARY", "ALL HANDS CLUB"]));
    // The golf course's own codes all sit under "Most used", so no empty golf group.
    expect(groups).not.toContain("VETEERANS MEMORIAL GOLF COURSE");
    expect(select.querySelectorAll("option[value='20091']")).toHaveLength(1); // not repeated below
    // 74 codes + the empty choice.
    expect(select.querySelectorAll("option")).toHaveLength(75);
  });

  it("shows the suggestion and applies it in one tap", () => {
    const onChange = vi.fn();
    render(
      <CodePicker
        kind="gl_account"
        value="701000"
        onChange={onChange}
        suggestion={{ code: "684000", reason: 'Grounds maintenance ("fertilizer")' }}
      />,
    );
    const hint = screen.getByText(/Suggested:/).closest("p") as HTMLElement;
    expect(within(hint).getByText("684000 — REPAIRS & MAINT GROUNDS")).toBeTruthy();
    expect(hint.textContent).toContain('Grounds maintenance ("fertilizer")');
    fireEvent.click(screen.getByRole("button", { name: "Use suggested G/L account 684000" }));
    expect(onChange).toHaveBeenCalledWith("684000");
  });

  it("hides the suggestion once it's the current pick", () => {
    render(<CodePicker kind="site" value="7011" onChange={() => {}} suggestion={{ code: "7011", reason: "Buckley's" }} />);
    expect(screen.queryByText(/Suggested:/)).toBeNull();
  });

  it("searches by number or word and keeps the current pick", () => {
    render(<CodePicker kind="gl_account" value="701005" onChange={() => {}} ariaLabel="G/L" />);
    fireEvent.click(screen.getByRole("button", { name: "Search all G/L accounts" }));
    fireEvent.change(screen.getByLabelText("Search G/L accounts"), { target: { value: "alcohol" } });
    const select = screen.getByLabelText("G/L") as HTMLSelectElement;
    const values = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(["151120", "301120", "401120", "701005"]));
    expect(values).not.toContain("684000");
    expect(screen.getByText(/matches/)).toBeTruthy();
  });

  it("keeps an old value that isn't on the official list visible", () => {
    render(<CodePicker kind="site" value="8400" onChange={() => {}} ariaLabel="Site" />);
    const select = screen.getByLabelText("Site") as HTMLSelectElement;
    expect(within(select).getByRole("option", { name: "8400 (not on the official list)" })).toBeTruthy();
    expect(select.value).toBe("8400");
  });

  it("reports picks", () => {
    const onChange = vi.fn();
    render(<CodePicker kind="site" value="" onChange={onChange} emptyLabel="— pick —" ariaLabel="Site" />);
    fireEvent.change(screen.getByLabelText("Site"), { target: { value: "7011" } });
    expect(onChange).toHaveBeenCalledWith("7011");
  });
});
