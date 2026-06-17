"use client";

import { useRouter } from "next/navigation";
import { Leaf, Briefcase, ChevronRight } from "lucide-react";
import { useView, type AppView } from "@/lib/providers/view-provider";

/**
 * First-launch view chooser. Shown once (until a view is stored) so the user
 * lands in the right "hat". Switchable later from the header + Settings.
 */
export function ViewPicker() {
  const { setView, homeFor } = useView();
  const router = useRouter();

  const choose = (v: AppView) => {
    setView(v);
    router.replace(homeFor(v));
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-[#B68D40] to-[#D4A853] items-center justify-center mb-3 shadow-sm">
            <Leaf className="w-7 h-7 text-[#1B4332]" strokeWidth={2.4} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Choose your view</h1>
          <p className="text-sm text-muted-foreground mt-1">
            You can switch anytime from the header or Settings.
          </p>
        </div>

        <button
          onClick={() => choose("super")}
          className="w-full gk-card p-4 flex items-center gap-4 mb-3 text-left active:scale-[0.99] transition"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Leaf className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Superintendent</p>
            <p className="text-sm text-muted-foreground">
              Turf &amp; crew operations
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        </button>

        <button
          onClick={() => choose("gm")}
          className="w-full gk-card p-4 flex items-center gap-4 text-left active:scale-[0.99] transition"
        >
          <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center shrink-0">
            <Briefcase className="w-6 h-6 text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">General Manager</p>
            <p className="text-sm text-muted-foreground">Budget, PRs &amp; admin</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        </button>
      </div>
    </div>
  );
}
