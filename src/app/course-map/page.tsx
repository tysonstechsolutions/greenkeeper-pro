"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Filter,
  Search,
  Flag,
  Circle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useHoleObservations,
  priorityColors,
  HOLE_PARS,
  HOLE_YARDS,
} from "@/lib/hooks/useHoleObservations";
import {
  useGreenObservations,
  greenPriorityColors,
} from "@/lib/hooks/useGreenObservations";
import type { TaskPriority } from "@/types/database";

// ── Hole image placeholder component ──
function HoleImage({
  holeNumber,
  className = "",
}: {
  holeNumber: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div
        className={`bg-gradient-to-b from-[#2D6A4F]/20 to-[#1B4332]/30 flex items-center justify-center ${className}`}
      >
        <div className="text-center">
          <Flag className="w-8 h-8 text-[#2D6A4F]/40 mx-auto mb-1" />
          <span className="text-3xl font-bold text-[#1B4332]/30">{holeNumber}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={`/holes/hole-${holeNumber}.png`}
      alt={`Hole ${holeNumber}`}
      className={`object-contain ${className}`}
      onError={() => setImgError(true)}
    />
  );
}

// ── Green image placeholder component ──
function GreenImage({
  holeNumber,
  className = "",
}: {
  holeNumber: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div
        className={`bg-gradient-to-b from-emerald-100 to-emerald-200/50 flex items-center justify-center ${className}`}
      >
        <div className="text-center">
          <Circle className="w-8 h-8 text-emerald-400/60 mx-auto mb-1" />
          <span className="text-2xl font-bold text-emerald-500/40">{holeNumber}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={`/greens/green-${holeNumber}.png`}
      alt={`Green ${holeNumber}`}
      className={`object-cover ${className}`}
      onError={() => setImgError(true)}
    />
  );
}

type TabType = "holes" | "greens";

export default function CourseMapPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("holes");
  const { observations: holeObs, loading: holeLoading, stats: holeStats, getOpenCountForHole } = useHoleObservations();
  const { observations: greenObs, loading: greenLoading, stats: greenStats, getOpenCountForGreen } = useGreenObservations();
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const stats = activeTab === "holes" ? holeStats : greenStats;
  const loading = activeTab === "holes" ? holeLoading : greenLoading;

  // Build per-hole summary data
  const holeSummaries = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) => {
      const holeNum = i + 1;
      const obs = holeObs.filter((o) => o.hole_number === holeNum);
      const openObs = obs.filter((o) => o.status !== "resolved");
      const highestPriority = openObs.reduce<TaskPriority | null>((highest, o) => {
        const order: TaskPriority[] = ["critical", "high", "normal", "low"];
        if (!highest) return o.priority;
        return order.indexOf(o.priority) < order.indexOf(highest) ? o.priority : highest;
      }, null);

      return {
        holeNumber: holeNum,
        par: HOLE_PARS[holeNum],
        yards: HOLE_YARDS[holeNum],
        totalIssues: obs.length,
        openIssues: openObs.length,
        resolvedIssues: obs.filter((o) => o.status === "resolved").length,
        highestPriority,
      };
    });
  }, [holeObs]);

  // Build per-green summary data
  const greenSummaries = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) => {
      const holeNum = i + 1;
      const obs = greenObs.filter((o) => o.hole_number === holeNum);
      const openObs = obs.filter((o) => o.status !== "resolved");
      const highestPriority = openObs.reduce<TaskPriority | null>((highest, o) => {
        const order: TaskPriority[] = ["critical", "high", "normal", "low"];
        if (!highest) return o.priority;
        return order.indexOf(o.priority) < order.indexOf(highest) ? o.priority : highest;
      }, null);

      return {
        holeNumber: holeNum,
        openIssues: openObs.length,
        totalIssues: obs.length,
        highestPriority,
      };
    });
  }, [greenObs]);

  // Filter holes
  const filteredHoles = useMemo(() => {
    return holeSummaries.filter((h) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !`hole ${h.holeNumber}`.includes(q) &&
          !`#${h.holeNumber}`.includes(q) &&
          !`par ${h.par}`.includes(q)
        ) {
          return false;
        }
      }
      if (filterPriority === "has_issues" && h.openIssues === 0) return false;
      if (filterPriority === "clear" && h.openIssues > 0) return false;
      if (
        ["critical", "high", "normal", "low"].includes(filterPriority) &&
        h.highestPriority !== filterPriority
      ) {
        return false;
      }
      return true;
    });
  }, [holeSummaries, search, filterPriority]);

  // Filter greens
  const filteredGreens = useMemo(() => {
    return greenSummaries.filter((g) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !`green ${g.holeNumber}`.includes(q) &&
          !`#${g.holeNumber}`.includes(q)
        ) {
          return false;
        }
      }
      if (filterPriority === "has_issues" && g.openIssues === 0) return false;
      if (filterPriority === "clear" && g.openIssues > 0) return false;
      if (
        ["critical", "high", "normal", "low"].includes(filterPriority) &&
        g.highestPriority !== filterPriority
      ) {
        return false;
      }
      return true;
    });
  }, [greenSummaries, search, filterPriority]);

  return (
    <div className="p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1B4332] flex items-center justify-center">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Course Map</h1>
            <p className="text-muted-foreground text-sm">
              {activeTab === "holes"
                ? "Tap any hole to report or view issues"
                : "Tap any green to report or view issues"}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg mb-6">
        <button
          onClick={() => { setActiveTab("holes"); setSearch(""); setFilterPriority("all"); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === "holes"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Flag className="w-4 h-4" />
          Holes
          {holeStats.open > 0 && (
            <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
              {holeStats.open}
            </span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab("greens"); setSearch(""); setFilterPriority("all"); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === "greens"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Circle className="w-4 h-4" />
          Greens
          {greenStats.open > 0 && (
            <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
              {greenStats.open}
            </span>
          )}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="gk-stat-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Open Issues</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{stats.open}</p>
        </div>
        <div className="gk-stat-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Eye className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Monitoring</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{stats.monitoring}</p>
        </div>
        <div className="gk-stat-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium uppercase tracking-wide">Resolved</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
        </div>
        <div className="gk-stat-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Flag className="w-4 h-4 text-red-600" />
            <span className="text-xs font-medium uppercase tracking-wide">Critical</span>
          </div>
          <p className="text-2xl font-bold text-red-700">{stats.critical}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={activeTab === "holes" ? "Search holes..." : "Search greens..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          size="icon"
          className="shrink-0"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4" />
        </Button>
      </div>

      {showFilters && (
        <div className="mb-4">
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by status..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {activeTab === "holes" ? "Holes" : "Greens"}</SelectItem>
              <SelectItem value="has_issues">Has Open Issues</SelectItem>
              <SelectItem value="clear">No Issues</SelectItem>
              <SelectItem value="critical">Critical Priority</SelectItem>
              <SelectItem value="high">High Priority</SelectItem>
              <SelectItem value="normal">Normal Priority</SelectItem>
              <SelectItem value="low">Low Priority</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ═══ HOLES TAB ═══ */}
      {activeTab === "holes" && (
        <>
          {/* Front 9 */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-2">
                Front Nine
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
              {filteredHoles
                .filter((h) => h.holeNumber <= 9)
                .map((hole) => (
                  <HoleCard
                    key={hole.holeNumber}
                    hole={hole}
                    openCount={getOpenCountForHole(hole.holeNumber)}
                    onClick={() => router.push(`/course-map/${hole.holeNumber}`)}
                  />
                ))}
            </div>
          </div>

          {/* Back 9 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-2">
                Back Nine
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
              {filteredHoles
                .filter((h) => h.holeNumber > 9)
                .map((hole) => (
                  <HoleCard
                    key={hole.holeNumber}
                    hole={hole}
                    openCount={getOpenCountForHole(hole.holeNumber)}
                    onClick={() => router.push(`/course-map/${hole.holeNumber}`)}
                  />
                ))}
            </div>
          </div>
        </>
      )}

      {/* ═══ GREENS TAB ═══ */}
      {activeTab === "greens" && (
        <>
          {/* Front 9 */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-2">
                Front Nine
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
              {filteredGreens
                .filter((g) => g.holeNumber <= 9)
                .map((green) => (
                  <GreenCard
                    key={green.holeNumber}
                    green={green}
                    openCount={getOpenCountForGreen(green.holeNumber)}
                    onClick={() => router.push(`/course-map/green/${green.holeNumber}`)}
                  />
                ))}
            </div>
          </div>

          {/* Back 9 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-2">
                Back Nine
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
              {filteredGreens
                .filter((g) => g.holeNumber > 9)
                .map((green) => (
                  <GreenCard
                    key={green.holeNumber}
                    green={green}
                    openCount={getOpenCountForGreen(green.holeNumber)}
                    onClick={() => router.push(`/course-map/green/${green.holeNumber}`)}
                  />
                ))}
            </div>
          </div>
        </>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
    </div>
  );
}

// ── Hole Card Component ──

interface HoleSummary {
  holeNumber: number;
  par: number;
  yards: number;
  totalIssues: number;
  openIssues: number;
  resolvedIssues: number;
  highestPriority: TaskPriority | null;
}

function HoleCard({
  hole,
  openCount,
  onClick,
}: {
  hole: HoleSummary;
  openCount: number;
  onClick: () => void;
}) {
  const hasCritical = hole.highestPriority === "critical";
  const hasHigh = hole.highestPriority === "high";
  const hasIssues = openCount > 0;

  return (
    <button
      onClick={onClick}
      className={`
        relative group bg-card rounded-xl border overflow-hidden
        transition-all duration-200 active:scale-[0.97]
        hover:shadow-lg hover:border-primary/30
        ${hasCritical ? "border-red-400 ring-1 ring-red-200" : hasHigh ? "border-orange-300" : "border-border"}
      `}
    >
      {/* Hole Image */}
      <div className="relative aspect-[3/4] bg-gradient-to-b from-green-50 to-green-100/50">
        <HoleImage
          holeNumber={hole.holeNumber}
          className="w-full h-full"
        />

        {/* Issue Count Badge */}
        {hasIssues && (
          <div
            className={`absolute top-2 right-2 min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center text-[11px] font-bold shadow-md ${
              hasCritical
                ? "bg-red-500 text-white"
                : hasHigh
                ? "bg-orange-500 text-white"
                : "bg-amber-500 text-white"
            }`}
          >
            {openCount}
          </div>
        )}

        {/* Priority indicator strip at bottom of image */}
        {hole.highestPriority && hasIssues && (
          <div
            className="absolute bottom-0 left-0 right-0 h-1"
            style={{
              backgroundColor: priorityColors[hole.highestPriority].pin,
            }}
          />
        )}
      </div>

      {/* Info Strip */}
      <div className="px-2 py-2 text-center">
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Par {hole.par}</span>
          <span>·</span>
          <span>{hole.yards} yds</span>
        </div>
        {hasIssues ? (
          <p className="text-xs font-medium text-amber-600 mt-0.5">
            {openCount} issue{openCount !== 1 ? "s" : ""}
          </p>
        ) : (
          <p className="text-xs text-green-600 mt-0.5 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Clear
          </p>
        )}
      </div>
    </button>
  );
}

// ── Green Card Component ──

interface GreenSummary {
  holeNumber: number;
  openIssues: number;
  totalIssues: number;
  highestPriority: TaskPriority | null;
}

function GreenCard({
  green,
  openCount,
  onClick,
}: {
  green: GreenSummary;
  openCount: number;
  onClick: () => void;
}) {
  const hasCritical = green.highestPriority === "critical";
  const hasHigh = green.highestPriority === "high";
  const hasIssues = openCount > 0;

  return (
    <button
      onClick={onClick}
      className={`
        relative group bg-card rounded-xl border overflow-hidden
        transition-all duration-200 active:scale-[0.97]
        hover:shadow-lg hover:border-emerald-400/30
        ${hasCritical ? "border-red-400 ring-1 ring-red-200" : hasHigh ? "border-orange-300" : "border-border"}
      `}
    >
      {/* Green Image */}
      <div className="relative aspect-square bg-gradient-to-b from-emerald-50 to-emerald-100/50">
        <GreenImage
          holeNumber={green.holeNumber}
          className="w-full h-full"
        />

        {/* Green Number Badge */}
        <div className="absolute top-2 left-2 w-7 h-7 rounded-full bg-emerald-700 flex items-center justify-center shadow-md">
          <span className="text-white text-sm font-bold">{green.holeNumber}</span>
        </div>

        {/* Issue Count Badge */}
        {hasIssues && (
          <div
            className={`absolute top-2 right-2 min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center text-[11px] font-bold shadow-md ${
              hasCritical
                ? "bg-red-500 text-white"
                : hasHigh
                ? "bg-orange-500 text-white"
                : "bg-amber-500 text-white"
            }`}
          >
            {openCount}
          </div>
        )}

        {/* Priority indicator strip */}
        {green.highestPriority && hasIssues && (
          <div
            className="absolute bottom-0 left-0 right-0 h-1"
            style={{
              backgroundColor: greenPriorityColors[green.highestPriority].pin,
            }}
          />
        )}
      </div>

      {/* Info Strip */}
      <div className="px-2 py-2 text-center">
        <div className="text-xs font-medium text-muted-foreground">
          Green {green.holeNumber}
        </div>
        {hasIssues ? (
          <p className="text-xs font-medium text-amber-600 mt-0.5">
            {openCount} issue{openCount !== 1 ? "s" : ""}
          </p>
        ) : (
          <p className="text-xs text-green-600 mt-0.5 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Clear
          </p>
        )}
      </div>
    </button>
  );
}
