import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { render, screen } from "../../utils/test-utils";
import { SendUpReadinessCard } from "@/components/pr-audit/send-up-readiness-card";
import type { PrAudit } from "@/types/database";
import type { AuditFinding } from "@/lib/pr-audit/audit";

function mockAudit(over: Partial<PrAudit>): PrAudit {
  return {
    audit_findings: [],
    bundle_findings: [],
    fit_findings: [],
    ...over,
  } as unknown as PrAudit;
}

const error: AuditFinding = {
  code: "invalid_cost_center",
  severity: "error",
  title: "Invalid cost center on line 2",
  detail: "",
  suggestion: null,
  itemIndex: 1,
  field: "cost_ctr",
};

describe("SendUpReadinessCard", () => {
  it("shows a ready verdict and an enabled send-up button on a clean PR", () => {
    const onSendUp = vi.fn();
    render(
      <SendUpReadinessCard audit={mockAudit({})} onSendUp={onSendUp} busy={false} />,
    );
    expect(screen.getByRole("heading", { name: /ready to send up/i })).toBeTruthy();
    const btn = screen.getByRole("button", { name: /send up for approval/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onSendUp).toHaveBeenCalledTimes(1);
  });

  it("blocks send-up when there is an audit error", () => {
    const onSendUp = vi.fn();
    render(
      <SendUpReadinessCard
        audit={mockAudit({ audit_findings: [error] })}
        onSendUp={onSendUp}
        busy={false}
      />,
    );
    expect(screen.getByRole("heading", { name: /fix before sending up/i })).toBeTruthy();
    expect(screen.getAllByText(/Invalid cost center on line 2/).length).toBeGreaterThan(0);
    const btn = screen.getByRole("button", { name: /resolve the issues/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onSendUp).not.toHaveBeenCalled();
  });
});
