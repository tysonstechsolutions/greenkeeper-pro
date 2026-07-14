"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, FileText, Phone, CornerDownLeft } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { getAllSearchableEntries } from "@/lib/layout/app-catalog";
import { createClient } from "@/lib/supabase/client";
import { formatInternalOrder } from "@/lib/pr-internal-order";

// ──────────────────────────────────────────────────────────────────────────
// Global command palette (⌘K / Ctrl+K). Searches every page & tool in the app
// catalog PLUS live records — staff, purchase requests, vendors. The record
// index is tiny (a 3-employee course) so we load it once when the palette
// first opens and filter everything in-memory: instant, no per-keystroke DB
// hits. Page search always works even if the record load fails.
// ──────────────────────────────────────────────────────────────────────────

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StaffHit {
  id: string;
  name: string;
  role: string | null;
  search: string;
}
interface PrHit {
  id: string;
  label: string;
  sub: string;
  search: string;
}
interface VendorHit {
  id: string;
  name: string;
  sub: string;
  search: string;
}

const GROUP_LIMIT = 8;

/** Every query token must appear somewhere in the haystack (AND match). */
function matches(haystack: string, tokens: string[]): boolean {
  return tokens.every((t) => haystack.includes(t));
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [staff, setStaff] = useState<StaffHit[]>([]);
  const [prs, setPrs] = useState<PrHit[]>([]);
  const [vendors, setVendors] = useState<VendorHit[]>([]);

  // Page/tool index — static, built once.
  const pages = useMemo(() => {
    return getAllSearchableEntries().map((entry) => ({
      href: entry.href,
      label: entry.label,
      icon: entry.icon,
      group: entry.group ?? "",
      search: [entry.label, entry.group ?? "", ...(entry.keywords ?? [])]
        .join(" ")
        .toLowerCase(),
    }));
  }, []);

  // Load the record index once, the first time the palette opens.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const [staffRes, prRes, vendorRes] = await Promise.all([
          supabase.from("profiles").select("id, full_name, role").order("full_name"),
          supabase
            .from("purchase_requests")
            .select("id, pr_sequence_number, date_prepared, vendor1_name, requestor_name")
            .order("created_at", { ascending: false })
            .limit(150),
          supabase.from("vendors").select("id, name, company").order("name"),
        ]);
        if (cancelled) return;

        const staffRows = (staffRes.data ?? []) as {
          id: string;
          full_name: string | null;
          role: string | null;
        }[];
        const prRows = (prRes.data ?? []) as {
          id: string;
          pr_sequence_number: number | null;
          date_prepared: string;
          vendor1_name: string | null;
          requestor_name: string | null;
        }[];
        const vendorRows = (vendorRes.data ?? []) as {
          id: string;
          name: string;
          company: string | null;
        }[];

        setStaff(
          staffRows
            .filter((r) => r.full_name)
            .map((r) => ({
              id: r.id,
              name: r.full_name as string,
              role: r.role,
              search: `${r.full_name} ${r.role ?? ""}`.toLowerCase(),
            })),
        );

        setPrs(
          prRows.map((r) => {
            const num =
              formatInternalOrder(r.pr_sequence_number, r.date_prepared) ?? "Draft PR";
            const sub = [r.vendor1_name, r.requestor_name].filter(Boolean).join(" · ");
            return {
              id: r.id,
              label: num,
              sub,
              search: `${num} ${r.vendor1_name ?? ""} ${r.requestor_name ?? ""}`.toLowerCase(),
            };
          }),
        );

        setVendors(
          vendorRows.map((r) => ({
            id: r.id,
            name: r.name,
            sub: r.company ?? "",
            search: `${r.name} ${r.company ?? ""}`.toLowerCase(),
          })),
        );
        setLoaded(true);
      } catch {
        // Record search is best-effort; page search still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hasQuery = tokens.length > 0;

  // Pages: with no query show a handful of common jump targets; otherwise filter.
  const pageResults = hasQuery
    ? pages.filter((p) => matches(p.search, tokens)).slice(0, GROUP_LIMIT)
    : pages.slice(0, 6);

  const staffResults = hasQuery
    ? staff.filter((s) => matches(s.search, tokens)).slice(0, GROUP_LIMIT)
    : [];
  const prResults = hasQuery
    ? prs.filter((p) => matches(p.search, tokens)).slice(0, GROUP_LIMIT)
    : [];
  const vendorResults = hasQuery
    ? vendors.filter((v) => matches(v.search, tokens)).slice(0, GROUP_LIMIT)
    : [];

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  // Clear the query whenever the dialog closes so it reopens fresh.
  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange(next);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Search"
      description="Jump to any page, tool, staff member, purchase request, or vendor."
    >
      <Command shouldFilter={false} className="rounded-xl!">
        <CommandInput
          placeholder="Search pages, staff, PRs, vendors…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {pageResults.length > 0 && (
            <CommandGroup heading={hasQuery ? "Pages & Tools" : "Jump to"}>
              {pageResults.map((p) => {
                const Icon = p.icon;
                return (
                  <CommandItem
                    key={`page-${p.href}`}
                    value={`page-${p.href}`}
                    onSelect={() => go(p.href)}
                  >
                    <Icon className="text-muted-foreground" />
                    <span>{p.label}</span>
                    {p.group && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {p.group}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {staffResults.length > 0 && (
            <CommandGroup heading="Staff">
              {staffResults.map((s) => (
                <CommandItem
                  key={`staff-${s.id}`}
                  value={`staff-${s.id}`}
                  onSelect={() => go(`/staff/profile?id=${s.id}`)}
                >
                  <Users className="text-muted-foreground" />
                  <span>{s.name}</span>
                  {s.role && (
                    <span className="ml-auto text-xs text-muted-foreground capitalize">
                      {s.role}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {prResults.length > 0 && (
            <CommandGroup heading="Purchase Requests">
              {prResults.map((p) => (
                <CommandItem
                  key={`pr-${p.id}`}
                  value={`pr-${p.id}`}
                  onSelect={() => go(`/purchase-requests/view?id=${p.id}`)}
                >
                  <FileText className="text-muted-foreground" />
                  <span>{p.label}</span>
                  {p.sub && (
                    <span className="ml-auto truncate max-w-[45%] text-xs text-muted-foreground">
                      {p.sub}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {vendorResults.length > 0 && (
            <CommandGroup heading="Vendors">
              {vendorResults.map((v) => (
                <CommandItem
                  key={`vendor-${v.id}`}
                  value={`vendor-${v.id}`}
                  onSelect={() => go(`/vendors?highlight=${v.id}`)}
                >
                  <Phone className="text-muted-foreground" />
                  <span>{v.name}</span>
                  {v.sub && (
                    <span className="ml-auto truncate max-w-[45%] text-xs text-muted-foreground">
                      {v.sub}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        <div className="flex items-center justify-end gap-1 border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          <CornerDownLeft className="size-3" /> to open
        </div>
      </Command>
    </CommandDialog>
  );
}
