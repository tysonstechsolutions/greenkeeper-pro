"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Bottom-sheet on mobile, centered modal on desktop. Mirrors the calendar's.
 *
 * Portalled to <body>: the route-enter animation leaves a `transform` on an
 * ancestor, which makes it the containing block for `position: fixed`, so an
 * unportalled sheet sat in the middle of the whole scrolled page rather than
 * the screen — half off the bottom on a long month. Nothing renders during the
 * prerender, where there is no `document.body` to portal into.
 */
export function Overlay({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Room for a whole week side by side on desktop. */
  wide?: boolean;
}) {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!inBrowser) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative w-full ${wide ? "sm:max-w-4xl" : "sm:max-w-lg"} bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto`}>
        <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center justify-between rounded-t-2xl z-10">
          <span className="font-semibold text-sm">{title}</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const noSubscribe = () => () => {};
