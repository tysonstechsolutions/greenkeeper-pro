"use client";

import { ShieldCheck, ShieldAlert, FileCheck2, Download, X, Loader2 } from "lucide-react";

export interface Section889Note {
  tone: "ok" | "warn" | "muted";
  text: string;
}

export interface DownloadChecklistProps {
  open: boolean;
  /** PR total formatted as money, or null for a bulk download. */
  prTotalText: string | null;
  /** For bulk downloads: how many PRs are being downloaded. */
  count?: number;
  section889: Section889Note;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE: Record<Section889Note["tone"], { cls: string; Icon: typeof ShieldCheck }> = {
  ok: { cls: "text-emerald-600", Icon: ShieldCheck },
  warn: { cls: "text-red-600", Icon: ShieldAlert },
  muted: { cls: "text-muted-foreground", Icon: ShieldCheck },
};

/**
 * A quick "before you sign & send it up" reminder shown before any download:
 *   1. Section 889 is valid.
 *   2. The vendor quote total matches the PR total.
 */
export function DownloadChecklist({
  open,
  prTotalText,
  count,
  section889,
  confirming = false,
  onConfirm,
  onCancel,
}: DownloadChecklistProps) {
  if (!open) return null;
  const tone = TONE[section889.tone];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold">Before you download</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Quick check before you sign and send {count && count > 1 ? "these" : "it"} up
          {count && count > 1 ? ` (${count} PRs)` : ""}:
        </p>

        <ul className="space-y-3">
          <li className="flex items-start gap-2.5">
            <tone.Icon className={`w-5 h-5 mt-0.5 shrink-0 ${tone.cls}`} />
            <div>
              <p className="text-sm font-semibold">Section 889 is valid</p>
              <p className={`text-xs ${section889.tone === "warn" ? "text-red-600" : "text-muted-foreground"}`}>
                {section889.text}
              </p>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <FileCheck2 className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Quote matches the PR total</p>
              <p className="text-xs text-muted-foreground">
                {prTotalText
                  ? `Confirm the attached vendor quote total matches this PR's total of ${prTotalText}.`
                  : "Confirm each attached vendor quote total matches its PR total."}
              </p>
            </div>
          </li>
        </ul>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card font-medium hover:bg-muted/40 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {confirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Looks good — download
          </button>
        </div>
      </div>
    </div>
  );
}
