"use client";

import { useState } from "react";
import { Copy, Loader2, Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format889Date, section889Status, type Section889Status } from "@/lib/section-889";
import { suggestKeeper, type DuplicateCandidate } from "@/lib/vendor-duplicates";

const STATUS_TEXT: Record<Section889Status, string> = {
  compliant: "889 good",
  expiring_soon: "889 expiring soon",
  expired: "889 expired",
  missing: "no 889",
};

const DISMISS_KEY = "vendors.dismissedDuplicateGroups";

/** Stable key for a group: its vendor ids, sorted. */
export function groupKey(group: { id: string }[]): string {
  return group
    .map((v) => v.id)
    .sort()
    .join("|");
}

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(keys: Set<string>) {
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...keys]));
  } catch {
    /* private mode / blocked storage — dismissing just won't stick */
  }
}

interface Props<T extends DuplicateCandidate> {
  groups: T[][];
  /** Combine the duplicates into the kept vendor. Throws on failure. */
  onCombine: (keepId: string, duplicateIds: string[]) => Promise<void>;
}

/**
 * "Possible duplicates" — each group of vendors that look like the same
 * business, with the suggested one to keep pre-picked. One tap combines.
 * "Not the same" hides a group on this device.
 */
export function DuplicateGroups<T extends DuplicateCandidate>({ groups, onCombine }: Props<T>) {
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readDismissed(),
  );
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errorByGroup, setErrorByGroup] = useState<Record<string, string>>({});

  const visible = groups.filter((g) => !dismissed.has(groupKey(g)));
  if (visible.length === 0) return null;

  async function combine(group: T[]) {
    const key = groupKey(group);
    const keepId = keepByGroup[key] ?? suggestKeeper(group).id;
    const keep = group.find((v) => v.id === keepId)!;
    const others = group.filter((v) => v.id !== keepId);
    if (
      !window.confirm(
        `Combine ${others.map((o) => `"${o.name}"`).join(", ")} into "${keep.name}"?\n\n` +
          "Missing details and the newest 889 are copied over, and purchase requests move to the kept vendor. " +
          "The duplicate disappears from the vendor list.",
      )
    ) {
      return;
    }
    setBusy(key);
    setErrorByGroup((e) => ({ ...e, [key]: "" }));
    try {
      await onCombine(keepId, others.map((o) => o.id));
    } catch (err) {
      setErrorByGroup((e) => ({ ...e, [key]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(null);
    }
  }

  function dismiss(group: T[]) {
    const next = new Set(dismissed);
    next.add(groupKey(group));
    setDismissed(next);
    writeDismissed(next);
  }

  return (
    <div className="mt-3 rounded-xl border border-sky-500/40 bg-sky-500/5 p-3">
      <div className="flex items-start gap-2 mb-2">
        <Copy className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Possible duplicates ({visible.length})
          </p>
          <p className="text-[11px] text-muted-foreground">
            These look like the same business. Pick the one to keep, then Combine.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {visible.map((group) => {
          const key = groupKey(group);
          const keepId = keepByGroup[key] ?? suggestKeeper(group).id;
          return (
            <div key={key} className="rounded-lg border border-border bg-background p-3">
              <fieldset>
                <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Keep which one?
                </legend>
                <div className="space-y-1.5">
                  {group.map((v) => {
                    const status = section889Status({
                      section_889_path: v.section_889_path ?? null,
                      section_889_expiration_date: v.section_889_expiration_date ?? null,
                    });
                    return (
                      <label key={v.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name={`keep-${key}`}
                          className="mt-1 h-4 w-4 accent-sky-700"
                          checked={keepId === v.id}
                          onChange={() => setKeepByGroup((k) => ({ ...k, [key]: v.id }))}
                        />
                        <span className="min-w-0">
                          <span className="font-medium break-words">{v.name}</span>
                          {v.company && <span className="text-muted-foreground"> · {v.company}</span>}
                          <span className="block text-[11px] text-muted-foreground">
                            {STATUS_TEXT[status]}
                            {v.section_889_expiration_date && status !== "missing"
                              ? ` (expires ${format889Date(v.section_889_expiration_date)})`
                              : ""}
                            {[v.city_state_zip, v.phone].filter(Boolean).length > 0
                              ? ` · ${[v.city_state_zip, v.phone].filter(Boolean).join(" · ")}`
                              : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {errorByGroup[key] && <p className="text-xs text-destructive mt-2">{errorByGroup[key]}</p>}
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="flex-1 gap-1.5" disabled={busy !== null} onClick={() => combine(group)}>
                  {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Merge className="w-3.5 h-3.5" />}
                  Combine
                </Button>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => dismiss(group)}>
                  Not the same
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
