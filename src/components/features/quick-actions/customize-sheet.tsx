"use client";

import { useEffect, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  QUICK_ACTION_CATALOGUE,
  useQuickActions,
} from "@/lib/hooks/useQuickActions";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

interface CustomizeSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet that lets the user pick which actions appear in their
 * dashboard Quick Actions grid. The parent is expected to conditionally
 * mount this (e.g. `{open && <QuickActionsCustomizeSheet ... />}`) so the
 * draft state resets to the saved state each time it's opened and we never
 * keep a stale backdrop mounted in the tree.
 */
export function QuickActionsCustomizeSheet({ open, onClose }: CustomizeSheetProps) {
  const { selectedIds, save, reset, minActions, maxActions } = useQuickActions();
  const [draft, setDraft] = useState<string[]>(selectedIds);

  // If the hook's saved IDs change while the sheet is mounted (e.g. the user
  // clicked Reset in another tab), sync the draft. Runs after render — never
  // during — so we don't trigger a synchronous re-render.
  useEffect(() => {
    setDraft(selectedIds);
  }, [selectedIds]);

  // Lock body scroll while the sheet is open so internal scrolling doesn't
  // chain to the page behind the backdrop.
  useBodyScrollLock(open);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (id: string) => {
    setDraft((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= minActions) return prev; // enforce min
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= maxActions) return prev; // enforce max
      return [...prev, id];
    });
  };

  const handleSave = () => {
    save(draft);
    onClose();
  };

  const handleReset = () => {
    reset();
    onClose();
  };

  const selectedCount = draft.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative w-full md:max-w-lg bg-card rounded-t-2xl md:rounded-2xl border border-border shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-base">Customize Quick Actions</h2>
            <p className="text-xs text-muted-foreground truncate">
              Pick {minActions}–{maxActions} ({selectedCount} selected)
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 -mr-1 flex items-center justify-center rounded-full active:bg-muted/70 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable catalogue */}
        <div className="overflow-y-auto flex-1 p-3">
          <div className="grid grid-cols-3 gap-2">
            {QUICK_ACTION_CATALOGUE.map((action) => {
              const isSelected = draft.includes(action.id);
              return (
                <button
                  key={action.id}
                  onClick={() => toggle(action.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all active:scale-95",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center text-white",
                      action.color
                    )}
                  >
                    <action.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-center leading-tight line-clamp-2">
                    {action.label}
                  </span>
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary-foreground" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/30 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-muted-foreground rounded-lg active:bg-muted/70 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-muted-foreground rounded-lg active:bg-muted/70 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={selectedCount < minActions}
            className="px-5 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-lg active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
