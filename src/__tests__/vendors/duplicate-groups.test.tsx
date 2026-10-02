import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "../utils/test-utils";
import { DuplicateGroups } from "@/components/features/vendors/duplicate-groups";

const groups = [
  [
    { id: "a", name: "Russo Hardware", section_889_path: "x", section_889_expiration_date: "2027-02-01", phone: "847-555-0100" },
    { id: "b", name: "Russo Hardware Inc", section_889_path: null, section_889_expiration_date: null },
  ],
  [
    { id: "c", name: "The Toro Company" },
    { id: "d", name: "Toro Co" },
  ],
];

// happy-dom has no window.confirm; the component asks before combining.
const confirmAnswer = { value: true };
beforeEach(() => {
  window.localStorage.clear();
  confirmAnswer.value = true;
  window.confirm = () => confirmAnswer.value;
});

describe("DuplicateGroups", () => {
  it("pre-picks the best vendor to keep and combines the rest into it", async () => {
    const onCombine = vi.fn(async () => undefined);
    const { user } = render(<DuplicateGroups groups={groups} onCombine={onCombine} />);

    expect(screen.getByText("Possible duplicates (2)")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Russo Hardware 889 good/ })).toBeChecked();

    await user.click(screen.getAllByRole("button", { name: /Combine/ })[0]);
    await waitFor(() => expect(onCombine).toHaveBeenCalledWith("a", ["b"]));

    // Choosing a different keeper is respected.
    await user.click(screen.getByRole("radio", { name: /^Toro Co/ }));
    await user.click(screen.getAllByRole("button", { name: /Combine/ })[1]);
    await waitFor(() => expect(onCombine).toHaveBeenLastCalledWith("d", ["c"]));
  });

  it("does nothing if the GM cancels, and shows a failure", async () => {
    confirmAnswer.value = false;
    // Plain function (not vi.fn) so the thrown error stays inside the component.
    let calls = 0;
    const onCombine = async () => {
      calls += 1;
      throw new Error("Only a manager can combine vendors");
    };
    const { user } = render(<DuplicateGroups groups={groups} onCombine={onCombine} />);
    await user.click(screen.getAllByRole("button", { name: /Combine/ })[0]);
    expect(calls).toBe(0);
    confirmAnswer.value = true;
    await user.click(screen.getAllByRole("button", { name: /Combine/ })[0]);
    expect(calls).toBe(1);
    expect(await screen.findByText("Only a manager can combine vendors")).toBeInTheDocument();
  });

  it("hides a group marked Not the same, and remembers it", async () => {
    const { user, unmount } = render(<DuplicateGroups groups={groups} onCombine={async () => undefined} />);
    await user.click(screen.getAllByRole("button", { name: "Not the same" })[1]);
    expect(screen.getByText("Possible duplicates (1)")).toBeInTheDocument();
    unmount();
    render(<DuplicateGroups groups={groups} onCombine={async () => undefined} />);
    expect(screen.getByText("Possible duplicates (1)")).toBeInTheDocument();
    expect(screen.queryByText("Toro Co")).toBeNull();
  });

  it("renders nothing without duplicates", () => {
    const { container } = render(<DuplicateGroups groups={[]} onCombine={async () => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
