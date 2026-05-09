"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  History,
  Image as ImageIcon,
  X,
  Search,
  Flag,
  Circle,
  ClipboardList,
  Wrench,
  Calendar,
  User,
  AlertTriangle,
  Download,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DetailPageHeader } from "@/components/ui/back-button";
import { downloadResolutionHistoryReport } from "@/lib/reports/resolution-history-report";
import {
  useHoleObservations,
  issueTypeLabels,
  issueTypeIcons,
  priorityLabels,
  priorityColors,
} from "@/lib/hooks/useHoleObservations";
import {
  useGreenObservations,
  greenIssueTypeLabels,
  greenIssueTypeIcons,
  greenPriorityLabels,
  greenPriorityColors,
} from "@/lib/hooks/useGreenObservations";
import type {
  GreenIssueType,
  GreenObservation,
  HoleIssueType,
  HoleObservation,
  TaskPriority,
} from "@/types/database";

type SurfaceFilter = "all" | "holes" | "greens";

interface UnifiedHistoryItem {
  surface: "Hole" | "Green";
  id: string;
  hole_number: number;
  title: string;
  issueLabel: string;
  icon: string;
  priority: TaskPriority;
  resolved_at: string;
  resolver_name: string | null;
  description: string | null;
  fix_instructions: string | null;
  before_photo_url: string | null;
  resolution_photos: string[];
  resolution_notes: string | null;
  reporter_name: string | null;
  raw: HoleObservation | GreenObservation;
}

export default function ResolutionHistoryPage() {
  const { observations: holeObs, loading: holeLoading } = useHoleObservations();
  const { observations: greenObs, loading: greenLoading } = useGreenObservations();

  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>("all");
  const [holeFilter, setHoleFilter] = useState<string>("all");
  const [withPhotosOnly, setWithPhotosOnly] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UnifiedHistoryItem | null>(null);
  const [photoOverlayUrl, setPhotoOverlayUrl] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Resolved profile names need to be fetched separately. The observation
  // hooks already join the reporter; resolver isn't in the joined select.
  const [resolverNames, setResolverNames] = useState<Record<string, string>>({});

  const loading = holeLoading || greenLoading;

  // Build the unified, sorted history list
  const history = useMemo<UnifiedHistoryItem[]>(() => {
    const items: UnifiedHistoryItem[] = [];

    for (const o of holeObs) {
      if (o.status !== "resolved" || !o.resolved_at) continue;
      items.push({
        surface: "Hole",
        id: o.id,
        hole_number: o.hole_number,
        title: o.title,
        issueLabel: issueTypeLabels[o.issue_type as HoleIssueType] || o.issue_type,
        icon: issueTypeIcons[o.issue_type as HoleIssueType] || "📍",
        priority: o.priority,
        resolved_at: o.resolved_at,
        resolver_name: o.resolved_by ? resolverNames[o.resolved_by] || null : null,
        description: o.description,
        fix_instructions: o.fix_instructions,
        before_photo_url: o.photo_url,
        resolution_photos: o.resolution_photos ?? [],
        resolution_notes: o.resolution_notes ?? null,
        reporter_name: o.reporter?.full_name ?? null,
        raw: o,
      });
    }

    for (const o of greenObs) {
      if (o.status !== "resolved" || !o.resolved_at) continue;
      items.push({
        surface: "Green",
        id: o.id,
        hole_number: o.hole_number,
        title: o.title,
        issueLabel:
          greenIssueTypeLabels[o.issue_type as GreenIssueType] || o.issue_type,
        icon: greenIssueTypeIcons[o.issue_type as GreenIssueType] || "📍",
        priority: o.priority,
        resolved_at: o.resolved_at,
        resolver_name: o.resolved_by ? resolverNames[o.resolved_by] || null : null,
        description: o.description,
        fix_instructions: o.fix_instructions,
        before_photo_url: o.photo_url,
        resolution_photos: o.resolution_photos ?? [],
        resolution_notes: o.resolution_notes ?? null,
        reporter_name: o.reporter?.full_name ?? null,
        raw: o,
      });
    }

    items.sort((a, b) => b.resolved_at.localeCompare(a.resolved_at));
    return items;
  }, [holeObs, greenObs, resolverNames]);

  // Fetch any resolver names we don't have yet (one round trip per page load)
  useEffect(() => {
    const ids = new Set<string>();
    for (const o of holeObs) {
      if (o.resolved_by) ids.add(o.resolved_by);
    }
    for (const o of greenObs) {
      if (o.resolved_by) ids.add(o.resolved_by);
    }
    const missing = Array.from(ids).filter((id) => !resolverNames[id]);
    if (missing.length === 0) return;

    (async () => {
      try {
        const { directSelectList } = await import("@/lib/supabase/rest");
        const rows = await directSelectList<{ id: string; full_name: string }>(
          "profiles",
          {
            columns: "id, full_name",
            filters: [`id=in.(${missing.join(",")})`],
            label: "resolution-history.resolverNames",
          },
        );
        setResolverNames((prev) => {
          const next = { ...prev };
          for (const r of rows) next[r.id] = r.full_name;
          return next;
        });
      } catch (err) {
        console.error("Failed to fetch resolver names:", err);
      }
    })();
  }, [holeObs, greenObs, resolverNames]);

  // Filtered list
  const filtered = useMemo(() => {
    return history.filter((it) => {
      if (surfaceFilter === "holes" && it.surface !== "Hole") return false;
      if (surfaceFilter === "greens" && it.surface !== "Green") return false;
      if (holeFilter !== "all" && it.hole_number !== parseInt(holeFilter, 10)) {
        return false;
      }
      if (withPhotosOnly && it.resolution_photos.length === 0) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack =
          `${it.surface} ${it.hole_number} ${it.title} ${it.issueLabel} ${it.resolution_notes ?? ""} ${it.description ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [history, surfaceFilter, holeFilter, withPhotosOnly, search]);

  const stats = useMemo(() => {
    return {
      total: history.length,
      withPhotos: history.filter((h) => h.resolution_photos.length > 0).length,
      thisMonth: history.filter((h) => {
        const d = new Date(h.resolved_at);
        const now = new Date();
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        );
      }).length,
      thisYear: history.filter((h) => {
        const d = new Date(h.resolved_at);
        return d.getFullYear() === new Date().getFullYear();
      }).length,
    };
  }, [history]);

  return (
    <div className="p-4 md:p-6 pb-24 overflow-x-hidden">
      <DetailPageHeader
        title={
          <span className="flex items-center gap-2">
            <History className="w-6 h-6 text-emerald-600" />
            Resolution History
          </span>
        }
        subtitle="A permanent record of every resolved course issue with before/after photos."
        backHref="/course-map"
        actions={
          <Button
            variant="default"
            size="sm"
            disabled={downloadingReport || filtered.length === 0}
            onClick={async () => {
              setDownloadError(null);
              setDownloadingReport(true);
              try {
                await downloadResolutionHistoryReport({
                  surface:
                    surfaceFilter === "holes"
                      ? "hole"
                      : surfaceFilter === "greens"
                        ? "green"
                        : undefined,
                  holeNumber:
                    holeFilter === "all" ? undefined : parseInt(holeFilter, 10),
                  withPhotosOnly,
                });
              } catch (err) {
                console.error("Resolution history report failed:", err);
                setDownloadError(
                  "Failed to generate the report. Please try again.",
                );
              } finally {
                setDownloadingReport(false);
              }
            }}
            className="gap-2 bg-emerald-700 hover:bg-emerald-600 text-white"
            title="Download a PDF of the resolved issues with before/after photos"
          >
            {downloadingReport ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloadingReport ? "Building PDF..." : "Download Report"}
          </Button>
        }
      />

      {downloadError && (
        <div className="mb-4 px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {downloadError}
          <button className="ml-auto" onClick={() => setDownloadError(null)} aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-medium uppercase tracking-wide">Total Resolved</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ImageIcon className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-medium uppercase tracking-wide">With Proof</span>
            </div>
            <p className="text-2xl font-bold text-blue-700">{stats.withPhotos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-medium uppercase tracking-wide">This Month</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">{stats.thisMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-medium uppercase tracking-wide">This Year</span>
            </div>
            <p className="text-2xl font-bold text-indigo-700">{stats.thisYear}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search resolved issues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={surfaceFilter} onValueChange={(v) => setSurfaceFilter(v as SurfaceFilter)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Surface" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Surfaces</SelectItem>
            <SelectItem value="holes">Holes Only</SelectItem>
            <SelectItem value="greens">Greens Only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={holeFilter} onValueChange={setHoleFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Hole" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Holes</SelectItem>
            {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => (
              <SelectItem key={n} value={n.toString()}>
                Hole {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={withPhotosOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setWithPhotosOnly((v) => !v)}
          className={`gap-1.5 sm:w-44 ${withPhotosOnly ? "bg-emerald-700 hover:bg-emerald-600 text-white" : ""}`}
          title="Only show issues that have at least one resolution photo"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          {withPhotosOnly ? "Photos Only" : "All Items"}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <History className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">
              {history.length === 0
                ? "No resolved issues yet"
                : "No items match the current filters"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              When you resolve an issue with proof photos, it appears here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((it) => (
            <button
              key={`${it.surface}-${it.id}`}
              onClick={() => setSelected(it)}
              className="w-full text-left bg-card rounded-xl border border-border p-3 hover:bg-muted/30 active:scale-[0.99] transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
                  {it.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="text-[10px] h-5 shrink-0 border-emerald-300 text-emerald-700 bg-emerald-50"
                    >
                      {it.surface === "Hole" ? (
                        <Flag className="w-3 h-3 mr-0.5" />
                      ) : (
                        <Circle className="w-3 h-3 mr-0.5" />
                      )}
                      {it.surface} {it.hole_number}
                    </Badge>
                    <p className="font-medium text-sm truncate">{it.title}</p>
                    {it.resolution_photos.length > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 shrink-0 border-blue-300 text-blue-700 bg-blue-50"
                      >
                        <ImageIcon className="w-3 h-3 mr-0.5" />
                        {it.resolution_photos.length} photo
                        {it.resolution_photos.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{it.issueLabel}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {(it.surface === "Hole" ? priorityColors : greenPriorityColors)[it.priority] && (
                      <Badge
                        className={`text-[10px] ${
                          (it.surface === "Hole" ? priorityColors : greenPriorityColors)[it.priority].bg
                        } ${
                          (it.surface === "Hole" ? priorityColors : greenPriorityColors)[it.priority].text
                        } border-0`}
                      >
                        {(it.surface === "Hole" ? priorityLabels : greenPriorityLabels)[it.priority]}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Resolved {new Date(it.resolved_at).toLocaleDateString()}
                    </span>
                    {it.resolver_name && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {it.resolver_name}
                      </span>
                    )}
                  </div>
                </div>
                {/* Thumbnail preview — prefer first resolution photo, fall back to before photo */}
                {(it.resolution_photos[0] || it.before_photo_url) && (
                  <img
                    src={it.resolution_photos[0] || it.before_photo_url || ""}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Detail sheet ── */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 pr-8">
                  <span className="text-lg">{selected.icon}</span>
                  <span className="flex-1 truncate">{selected.title}</span>
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {selected.surface} {selected.hole_number} · {selected.issueLabel}
                </p>
              </SheetHeader>

              <div className="space-y-4 mt-4 pb-6">
                {/* Resolved badge */}
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">
                    Resolved {new Date(selected.resolved_at).toLocaleString()}
                  </span>
                </div>

                {/* Before photo (the original observation photo) */}
                {selected.before_photo_url && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Before
                    </p>
                    <button
                      type="button"
                      onClick={() => setPhotoOverlayUrl(selected.before_photo_url)}
                      className="block w-full"
                    >
                      <img
                        src={selected.before_photo_url}
                        alt="Before"
                        className="w-full h-56 object-cover rounded-xl border border-border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </button>
                  </div>
                )}

                {/* After photos */}
                {selected.resolution_photos.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      After ({selected.resolution_photos.length} photo
                      {selected.resolution_photos.length === 1 ? "" : "s"})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {selected.resolution_photos.map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setPhotoOverlayUrl(url)}
                          className="block w-full"
                        >
                          <img
                            src={url}
                            alt="Resolution proof"
                            className="aspect-square w-full rounded-xl object-cover border border-emerald-200"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolution notes */}
                {selected.resolution_notes && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5" />
                      What Was Done
                    </p>
                    <p className="text-sm text-emerald-900 whitespace-pre-line">
                      {selected.resolution_notes}
                    </p>
                  </div>
                )}

                {/* Original description */}
                {selected.description && (
                  <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Original Description
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-line">
                      {selected.description}
                    </p>
                  </div>
                )}

                {/* Fix plan that was followed */}
                {selected.fix_instructions && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5" />
                      Fix Plan Followed
                    </p>
                    <p className="text-sm text-amber-900 whitespace-pre-line">
                      {selected.fix_instructions}
                    </p>
                  </div>
                )}

                {/* Meta */}
                <div className="text-xs text-muted-foreground space-y-1">
                  {selected.reporter_name && (
                    <p>Originally reported by {selected.reporter_name}</p>
                  )}
                  {selected.resolver_name && <p>Resolved by {selected.resolver_name}</p>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Full-screen photo overlay (lightbox) */}
      {photoOverlayUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setPhotoOverlayUrl(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              setPhotoOverlayUrl(null);
            }}
          >
            <X className="w-6 h-6" />
          </Button>
          <img
            src={photoOverlayUrl}
            alt="Photo"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
