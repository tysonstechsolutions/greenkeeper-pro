"use client";

import { X } from "lucide-react";

/** Bottom-sheet on mobile, centered modal on desktop. Mirrors the calendar's. */
export function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl z-10">
          <span className="font-semibold text-sm">{title}</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
