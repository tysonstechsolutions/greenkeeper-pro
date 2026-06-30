"use client";

import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  MinusCircle,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import type { PrAudit } from "@/types/database";
import {
  computeSendUpReadiness,
  type CheckStatus,
  type ReadinessVerdict,
} from "@/lib/pr-audit/send-up-readiness";

const VERDICT_STYLE: Record<
  ReadinessVerdict,
  { bg: string; border: string; text: string; label: string }
> = {
  ready: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    text: "text-emerald-700 dark:text-emerald-300",
    label: "Ready to send up",
  },
  review: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    text: "text-amber-700 dark:text-amber-300",
    label: "Glance, then send up",
  },
  blocked: {
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    text: "text-red-700 dark:text-red-300",
    label: "Fix before sending up",
  },
};

const CHECK_ICON: Record<CheckStatus, { Icon: LucideIcon; color: string }> = {
  pass: { Icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" },
  warn: { Icon: AlertCircle, color: "text-amber-600 dark:text-amber-400" },
  fail: { Icon: AlertTriangle, color: "text-red-600 dark:text-red-400" },
  na: { Icon: MinusCircle, color: "text-muted-foreground" },
};

/**
 * "Ready to send up?" verdict — consolidates the PR's deterministic audit and
 * bundle findings into one answer + a checklist, so the reviewer can trust it
 * and advance without re-checking everything. The send-up button is enabled for
 * ready/review (warnings don't block) and disabled when there are hard errors.
 */
export function SendUpReadinessCard({
  audit,
  onSendUp,
  busy,
}: {
  audit: PrAudit;
  onSendUp: () => void;
  busy: boolean;
}) {
  const r = computeSendUpReadiness({
    auditFindings: audit.audit_findings ?? [],
    bundleFindings: audit.bundle_findings ?? [],
    fitCount: (audit.fit_findings ?? []).length,
  });
  const v = VERDICT_STYLE[r.verdict];
  const canSend = r.verdict !== "blocked";

  return (
    <div className={`rounded-2xl border ${v.border} ${v.bg} p-4 mb-4`}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className={`w-4 h-4 ${v.text}`} />
        <h2 className={`font-semibold text-sm ${v.text}`}>{v.label}</h2>
      </div>
      <p className="text-sm mb-3">{r.headline}</p>

      <ul className="space-y-1.5 mb-3">
        {r.checks.map((c) => {
          const { Icon, color } = CHECK_ICON[c.status];
          return (
            <li key={c.key} className="flex items-start gap-2 text-xs">
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <span
                className={
                  c.status === "na" ? "text-muted-foreground" : "font-medium"
                }
              >
                {c.label}
              </span>
              {c.detail && (
                <span className="text-muted-foreground min-w-0 truncate">
                  — {c.detail}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {r.blockers.length > 0 && (
        <div className="text-xs text-red-700 dark:text-red-300 mb-3">
          <p className="font-medium mb-1">Fix first:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {r.blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onSendUp}
        disabled={busy || !canSend}
        className={`w-full rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
          canSend
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        } disabled:opacity-60`}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle2 className="w-4 h-4" />
        )}
        {canSend ? "Send up for approval" : "Resolve the issues above first"}
      </button>
    </div>
  );
}
