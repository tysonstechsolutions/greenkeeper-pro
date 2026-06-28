import Link from "next/link";
import type { AppEntry } from "@/lib/layout/app-catalog";

/**
 * Shared landing page for a "hub" — a single menu entry that groups several
 * related tools. Renders the hub's member tools as a card grid. The tools
 * keep their own routes; this page is purely a grouped launcher.
 */
export function HubPage({
  title,
  description,
  items,
}: {
  title: string;
  description?: string;
  items: AppEntry[];
}) {
  return (
    <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">{title}</h1>
      {description && (
        <p className="text-sm text-muted-foreground mb-6">{description}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 active:scale-95 active:bg-muted/40 transition-all"
          >
            <div
              className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-sm`}
            >
              <item.icon className="w-6 h-6" />
            </div>
            <span className="text-[13px] font-medium text-foreground text-center leading-tight">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
