"use client";

import { useRouter } from "next/navigation";
import { Leaf, Briefcase, Landmark, ArrowLeftRight, type LucideIcon } from "lucide-react";
import { useView, type AppView } from "@/lib/providers/view-provider";
import { cn } from "@/lib/utils";

/**
 * Compact header control showing the current view. Tapping it cycles to the
 * next view (Superintendent → General Manager → Business Division Head → …)
 * and jumps to that view's home. A fuller picker also lives in Settings and
 * on the first-run screen.
 */
const ORDER: AppView[] = ["super", "gm", "bdh"];
const META: Record<AppView, { short: string; full: string; icon: LucideIcon }> = {
  super: { short: "Super", full: "Superintendent", icon: Leaf },
  gm: { short: "GM", full: "General Manager", icon: Briefcase },
  bdh: { short: "Division", full: "Business Division Head", icon: Landmark },
};

export function ViewSwitch({ className }: { className?: string }) {
  const { view, setView, homeFor } = useView();
  const router = useRouter();

  const next = ORDER[(ORDER.indexOf(view) + 1) % ORDER.length];
  const Icon = META[view].icon;

  return (
    <button
      type="button"
      onClick={() => {
        setView(next);
        router.push(homeFor(next));
      }}
      aria-label={`Current view: ${META[view].full}. Tap to switch to ${META[next].full}.`}
      className={cn(
        "flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-full bg-muted/60 active:scale-95 transition",
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-[13px] font-semibold text-foreground">{META[view].short}</span>
      <ArrowLeftRight className="w-3 h-3 text-muted-foreground shrink-0" />
    </button>
  );
}
