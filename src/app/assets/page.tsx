"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  XCircle,
  Search,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFy26Assets, type Fy26AssetFilters } from "@/lib/hooks/useFy26Assets";
import {
  fy26AssetStatusLabels,
  fy26AssetStatusColors,
  fy26AssetSiteLabels,
  type Fy26AssetStatus,
} from "@/types/fy26-assets";

function StatCard({
  label,
  count,
  color,
  icon: Icon,
  onClick,
  active,
}: {
  label: string;
  count: number;
  color: string;
  icon: typeof CheckCircle;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-card rounded-lg border p-4 text-left transition-all hover:shadow-md ${
        active ? "ring-2 ring-primary border-primary" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5" style={{ color }} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-3xl font-bold" style={{ color }}>
        {count}
      </p>
    </button>
  );
}

export default function AssetsPage() {
  const router = useRouter();
  const { assets, loading, error, fetchAssets, stats } = useFy26Assets();

  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<Fy26AssetStatus | "all">("all");

  // Debounced fetch on filter change
  useEffect(() => {
    const timeout = setTimeout(() => {
      const filters: Fy26AssetFilters = {};
      if (siteFilter !== "all") filters.site = siteFilter;
      if (statusFilter !== "all") filters.status = statusFilter;
      if (search.trim()) filters.search = search.trim();
      fetchAssets(filters);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, siteFilter, statusFilter, fetchAssets]);

  const toggleStatus = (s: Fy26AssetStatus) =>
    setStatusFilter((prev) => (prev === s ? "all" : s));

  const formatMoney = (v: number | null | undefined) =>
    v == null ? "—" : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const totalValueFormatted = useMemo(
    () => `$${stats.total_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    [stats.total_value]
  );

  return (
    <div className="p-4 md:p-6 pb-24">
      <PageHeader
        title="FY26 Assets"
        description={`Annual Inventory (AI) \u2014 SITE 7009 & 7010 \u2022 Total value ${totalValueFormatted}`}
        icon={Archive}
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Present"
          count={stats.verified_present}
          color={fy26AssetStatusColors.verified_present}
          icon={CheckCircle}
          onClick={() => toggleStatus("verified_present")}
          active={statusFilter === "verified_present"}
        />
        <StatCard
          label="MIA"
          count={stats.mia}
          color={fy26AssetStatusColors.mia}
          icon={AlertTriangle}
          onClick={() => toggleStatus("mia")}
          active={statusFilter === "mia"}
        />
        <StatCard
          label="Unverified"
          count={stats.unverified}
          color={fy26AssetStatusColors.unverified}
          icon={HelpCircle}
          onClick={() => toggleStatus("unverified")}
          active={statusFilter === "unverified"}
        />
        <StatCard
          label="Disposed"
          count={stats.disposed}
          color={fy26AssetStatusColors.disposed}
          icon={XCircle}
          onClick={() => toggleStatus("disposed")}
          active={statusFilter === "disposed"}
        />
      </div>

      {/* Search + site filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search description, asset #, serial, model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="All Sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {Object.entries(fy26AssetSiteLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading && assets.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : assets.length === 0 ? (
        <div className="text-center py-12">
          <Archive className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No assets match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map((a) => {
            const statusColor = fy26AssetStatusColors[a.status];
            return (
              <Card
                key={a.id}
                className="cursor-pointer hover:shadow-md active:bg-muted/30 transition-all rounded-xl"
                onClick={() => router.push(`/assets/${a.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex gap-3 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-base truncate">
                          {a.description}
                        </h3>
                        <Badge
                          variant="outline"
                          style={{
                            backgroundColor: `${statusColor}15`,
                            borderColor: statusColor,
                            color: statusColor,
                          }}
                          className="text-xs"
                        >
                          {fy26AssetStatusLabels[a.status]}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>
                          <span className="font-mono">{a.asset_number}</span>
                          {a.sub_number && a.sub_number !== "0" && (
                            <span className="font-mono"> / sub {a.sub_number}</span>
                          )}
                          <span className="mx-2">{"\u2022"}</span>
                          <span>Site {a.site}</span>
                          {a.qty !== 1 && (
                            <>
                              <span className="mx-2">{"\u2022"}</span>
                              <span>Qty {a.qty}</span>
                            </>
                          )}
                        </div>
                        {(a.manufacturer || a.model_text) && (
                          <div className="truncate">
                            {[a.manufacturer, a.model_text].filter(Boolean).join(" \u2022 ")}
                          </div>
                        )}
                        {a.serial_number && (
                          <div className="truncate">
                            <span className="text-muted-foreground/70">SN:</span>{" "}
                            <span className="font-mono">{a.serial_number}</span>
                          </div>
                        )}
                        <div>{formatMoney(a.original_value)}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground/40 self-center flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
