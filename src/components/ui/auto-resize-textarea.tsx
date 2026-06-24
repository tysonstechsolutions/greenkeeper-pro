"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A textarea that grows to fit its content instead of scrolling internally.
 *
 * Why: a fixed-height textarea whose content overflows scrolls inside itself,
 * and click-dragging to select text near its top/bottom edge makes the browser
 * auto-scroll that inner content to chase the cursor — the selection then races
 * to the very top/bottom and grabs far more than intended. Sizing the element
 * to its content removes the inner scrollbar entirely, so the only thing that
 * scrolls during a drag-select is the surrounding panel (one smooth scroll
 * context, normal speed).
 *
 * Uses the JS scrollHeight approach (works in every browser/WebView) rather
 * than CSS `field-sizing: content`, which isn't available on older Android
 * WebViews the native shell may run on.
 */
function AutoResizeTextarea({
  className,
  value,
  ...props
}: React.ComponentProps<"textarea">) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      // overflow-hidden + no manual resize handle: the element is always
      // exactly tall enough for its text, so it never has an inner scrollbar.
      className={cn("resize-none overflow-hidden", className)}
      {...props}
    />
  );
}

export { AutoResizeTextarea };
