"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useView } from "@/lib/providers/view-provider";
import { NAV_ITEMS } from "@/lib/layout/nav-config";

export function BottomNav() {
  const pathname = usePathname();
  const { view } = useView();

  const navItems = NAV_ITEMS[view];

  const topLevelHrefs = navItems
    .filter((item) => item.href !== "/more")
    .map((item) => item.href);
  const isOnTopLevel = topLevelHrefs.some(
    (href) => pathname === href || pathname.startsWith(href + "/"),
  );
  const isMoreActive = !isOnTopLevel;

  return (
    <nav
      data-bottom-nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/80 backdrop-blur-xl border-t border-border/50 safe-area-bottom"
    >
      <div className="flex items-center justify-around h-[72px] px-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/more"
              ? isMoreActive
              : pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-2 rounded-xl transition-all relative",
                "min-w-[64px] min-h-[56px]",
                "active:scale-95 active:bg-primary/5",
                isActive ? "text-primary" : "text-muted-foreground/60",
              )}
            >
              {isActive && (
                <span className="absolute inset-x-2 top-1 bottom-1 rounded-xl bg-primary/8" />
              )}
              <div className="relative z-10">
                <item.icon
                  className={cn(
                    "w-6 h-6 transition-all",
                    isActive ? "text-primary" : "text-muted-foreground/60",
                  )}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
              </div>
              <span
                className={cn(
                  "text-xs font-medium mt-0.5 relative z-10",
                  isActive
                    ? "text-primary font-semibold"
                    : "text-muted-foreground/60",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
