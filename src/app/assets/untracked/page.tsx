"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Archive,
  Plus,
  Search,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUntrackedAssets } from "@/lib/hooks/useUntrackedAssets";
import {
  UNTRACKED_ASSET_CATEGORIES,
  untrackedAssetCategoryLabels,
  type UntrackedAssetCategory,
} from "@/types/untracked-assets";

function UntrackedAssetsContent() {
  const router = useRouter();
  const { assets, loading, fetchAssets } = useUntrackedAssets();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    UntrackedAssetCategory | "all"
  >("all");

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchAssets({
        category: categoryFilter === "all" ? undefined : categoryFilter,
        search: search.trim() || undefined,
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [search, categoryFilter, fetchAssets]);

  // Per-category counts from the current view (no second round-trip).
  const countsByCategory = useMemo(() => {
    const m = new Map<UntrackedAssetCategory, number>();
    for (const a of assets) m.set(a.category, (m.get(a.category) ?? 0) + 1);
    return m;
  }, [assets]);

  return (
    <div className="p-4 md:p-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/assets")}
          aria-label="Back to Assets"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Archive className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground truncate">
            Untracked Assets
          </h1>
          <p className="text-sm text-muted-foreground">
            Facility items not on the FY26 MWRMA inventory
          </p>
        </div>
        <Button onClick={() => router.push("/assets/untracked/new")} size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          Add
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, manufacturer, model, serial…"
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={(v) =>
            setCategoryFilter(v as UntrackedAssetCategory | "all")
          }
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {UNTRACKED_ASSET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {untrackedAssetCategoryLabels[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category chips summary */}
      <div className="flex gap-2 flex-wrap mb-4">
        {UNTRACKED_ASSET_CATEGORIES.map((c) => {
          const count = countsByCategory.get(c) ?? 0;
          if (count === 0) return null;
          const active = categoryFilter === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategoryFilter(active ? "all" : c)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {untrackedAssetCategoryLabels[c]} · {count}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Loading…
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
          <Archive className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            {search || categoryFilter !== "all"
              ? "No untracked assets match your filters."
              : "No untracked assets yet. Tap Add to record one."}
          </p>
          <Button
            onClick={() => router.push("/assets/untracked/new")}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add the first one
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map((a) => (
            <Link
              key={a.id}
              href={`/assets/untracked/view?id=${a.id}`}
              className="block"
            >
              <Card className="hover:shadow-md active:bg-muted/30 transition-all rounded-xl">
                <CardContent className="p-4 flex gap-3 items-start">
                  {a.photos[0] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={a.photos[0]}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Archive className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-base truncate">
                        {a.name}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {untrackedAssetCategoryLabels[a.category]}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {(a.manufacturer || a.model) && (
                        <div className="truncate">
                          {[a.manufacturer, a.model].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {a.serial_number && (
                        <div className="truncate">
                          <span className="text-muted-foreground/70">SN:</span>{" "}
                          <span className="font-mono">{a.serial_number}</span>
                        </div>
                      )}
                      {a.location && (
                        <div className="truncate">📍 {a.location}</div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground/40 self-center" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
        </div>
      }
    >
      <UntrackedAssetsContent />
    </Suspense>
  );
}
