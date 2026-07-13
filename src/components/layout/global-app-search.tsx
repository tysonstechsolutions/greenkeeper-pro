"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, Settings } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAppUsage } from "@/lib/hooks/useAppUsage";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  flattenCatalog,
  getCatalog,
  groupCatalog,
  type AppEntry,
} from "@/lib/layout/app-catalog";

const NOTIFICATIONS: AppEntry = {
  href: "/notifications",
  label: "Notifications",
  icon: Bell,
  color: "",
  group: "Utilities",
};

const SETTINGS: AppEntry = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
  color: "",
  group: "Utilities",
};

function commandValue(entry: AppEntry): string {
  return [entry.label, entry.group, entry.href, ...(entry.keywords ?? [])]
    .filter(Boolean)
    .join(" ");
}

export function GlobalAppSearch() {
  const router = useRouter();
  const { isPro, isForeman, isMechanic, isCrew, profile } = useAuth();
  const { record } = useAppUsage();
  const [open, setOpen] = useState(false);
  const isLaborer = isCrew || profile?.role === "seasonal";

  const sections = useMemo(() => {
    const catalog = getCatalog({ isPro, isForeman, isMechanic, isLaborer });
    const utilities = isPro || isLaborer
      ? [NOTIFICATIONS]
      : [NOTIFICATIONS, SETTINGS];
    return groupCatalog(flattenCatalog([...catalog, ...utilities]));
  }, [isForeman, isLaborer, isMechanic, isPro]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = (entry: AppEntry) => {
    record(entry.href);
    setOpen(false);
    router.push(entry.href);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Search the whole app"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-[min(34vw,28rem)] items-center gap-2 rounded-full border border-border/70 bg-muted/45 px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:border-border hover:bg-muted/70 lg:flex"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search the whole app…</span>
        <kbd className="ml-auto rounded border border-border/70 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Ctrl K
        </kbd>
      </button>

      <button
        type="button"
        aria-label="Search the whole app"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/60 active:bg-muted/80 lg:hidden"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search the whole app"
        description="Find a page, tool, form, or workspace and open it."
        className="max-w-xl"
        showCloseButton
      >
        <Command>
          <CommandInput placeholder="Search pages, tools, and forms…" autoFocus />
          <CommandList className="max-h-[min(60vh,28rem)]">
            <CommandEmpty>No matching page or tool found.</CommandEmpty>
            {sections.map((section) => (
              <CommandGroup key={section.label} heading={section.label}>
                {section.items.map((entry) => (
                  <CommandItem
                    key={entry.href}
                    value={commandValue(entry)}
                    onSelect={() => navigate(entry)}
                    className="py-2.5"
                  >
                    <entry.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{entry.label}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {entry.href}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
