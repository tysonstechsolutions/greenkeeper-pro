"use client";

import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import type { AuditFinding, AuditSeverity } from "@/lib/pr-audit/audit";

const SEVERITY_STYLE: Record<
  AuditSeverity,
  { wrap: string; icon: typeof AlertCircle; iconColor: string; label: string }
> = {
  error: {
    wrap: "border-red-500/30 bg-red-500/5",
    icon: AlertCircle,
    iconColor: "text-red-600",
    label: "Error",
  },
  warning: {
    wrap: "border-amber-500/30 bg-amber-500/5",
    icon: AlertTriangle,
    iconColor: "text-amber-600",
    label: "Warning",
  },
  info: {
    wrap: "border-blue-500/30 bg-blue-500/5",
    icon: Info,
    iconColor: "text-blue-600",
    label: "Info",
  },
};

const SEVERITY_ORDER: Record<AuditSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function FindingsSummary({
  errorCount,
  warningCount,
  infoCount = 0,
}: {
  errorCount: number;
  warningCount: number;
  infoCount?: number;
}) {
  const clean = errorCount === 0 && warningCount === 0;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {clean ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
          <CheckCircle2 className="w-4 h-4" /> Passed all checks
        </span>
      ) : (
        <>
          {errorCount > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-600">
              <AlertCircle className="w-4 h-4" /> {errorCount} error
              {errorCount !== 1 ? "s" : ""}
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600">
              <AlertTriangle className="w-4 h-4" /> {warningCount} warning
              {warningCount !== 1 ? "s" : ""}
            </span>
          )}
        </>
      )}
      {infoCount > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600">
          <Info className="w-3.5 h-3.5" /> {infoCount} note
          {infoCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

export function FindingsList({ findings }: { findings: AuditFinding[] }) {
  if (findings.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
        <div>
          <p className="font-semibold text-sm">Everything checks out</p>
          <p className="text-xs text-muted-foreground">
            Codes, the 3% fee, sales tax, the total, and the attachment all look
            correct.
          </p>
        </div>
      </div>
    );
  }

  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return (
    <ul className="space-y-2">
      {sorted.map((f, i) => {
        const s = SEVERITY_STYLE[f.severity];
        const Icon = s.icon;
        return (
          <li
            key={`${f.code}-${f.itemIndex ?? "x"}-${i}`}
            className={`rounded-xl border p-3 ${s.wrap}`}
          >
            <div className="flex items-start gap-2.5">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.iconColor}`} />
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-snug">{f.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {f.detail}
                </p>
                {f.suggestion && (
                  <p className="text-xs mt-1.5 flex items-start gap-1.5 text-foreground">
                    <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
                    <span>
                      <span className="font-medium">Fix:</span> {f.suggestion}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
