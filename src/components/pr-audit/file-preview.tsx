"use client";

import { useEffect, useState } from "react";
import { Save, ArrowUpRight, X } from "lucide-react";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

export interface PreviewSource {
  blob: Blob;
  kind: "pdf" | "image";
  filename: string;
}

/**
 * Full-screen preview of a PR document (PDF in an iframe, photo in an img),
 * mirroring the PR builder's "PR Preview" overlay — Download, Open-in-new-tab
 * (the CSP-safe fallback), and Close. Manages its own object-URL lifecycle.
 */
export function FilePreviewOverlay({
  source,
  onClose,
}: {
  source: PreviewSource | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useBodyScrollLock(!!source);

  useEffect(() => {
    if (!source) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(source.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [source]);

  if (!source) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-background border-b border-border">
        <span className="text-sm font-medium truncate min-w-0">{source.filename}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              saveBlobToDevice({
                blob: source.blob,
                filename: source.filename,
                shareTitle: "PR preview",
              })
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Download
          </button>
          {url && (
            <button
              type="button"
              onClick={() => window.open(url, "_blank", "noopener")}
              title="Opens in a new browser tab — works even if the inline preview is blocked"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Open in new tab
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center p-2">
        {!url ? null : source.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={source.filename}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <>
            <iframe src={url} className="w-full h-full border-0" title="PR Preview" />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-foreground/80 text-background text-[11px] pointer-events-none backdrop-blur-sm">
              Inline preview blocked? Use{" "}
              <span className="font-semibold">Open in new tab</span> above.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
