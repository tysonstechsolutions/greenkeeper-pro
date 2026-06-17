"use client";

import { useRouter } from "next/navigation";
import { Leaf, Briefcase, ArrowLeftRight } from "lucide-react";
import { useView, type AppView } from "@/lib/providers/view-provider";
import { cn } from "@/lib/utils";

/**
 * Compact header control showing the current view (Superintendent / GM).
 * Tapping it flips to the other view and jumps to that view's home. A fuller
 * two-option picker also lives in Settings and on the More page.
 */
export function ViewSwitch({ className }: { className?: string }) {
  const { view, setView, homeFor } = useView();
  const router = useRouter();

  const next: AppView = view === "super" ? "gm" : "super";
  const Icon = view === "super" ? Leaf : Briefcase;
  const label = view === "super" ? "Super" : "GM";

  return (
    <button
      type="button"
      onClick={() => {
        setView(next);
        router.push(homeFor(next));
      }}
      aria-label={`Current view: ${label}. Switch to ${
        next === "gm" ? "General Manager" : "Superintendent"
      }.`}
      className={cn(
        "flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-full bg-muted/60 active:scale-95 transition",
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      <ArrowLeftRight className="w-3 h-3 text-muted-foreground shrink-0" />
    </button>
  );
}
