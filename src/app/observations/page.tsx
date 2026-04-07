"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Eye,
  Plus,
  Search,
  Filter,
  X,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  StickyNote,
  MapPin,
  Hash,
  Tag,
  Loader2,
  CheckCircle2,
  Circle,
  ChevronRight,
  BarChart3,
  Trash2,
  ArrowRight,
  Footprints,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useObservations,
  observationCategoryConfig,
  sentimentConfig,
} from "@/lib/hooks/useObservations";
import type {
  ObservationCategory,
  ObservationSentiment,
  CourseObservation,
} from "@/types/database";

const CATEGORY_OPTIONS: { value: ObservationCategory; label: string }[] = [
  { value: "turf", label: "Turf" },
  { value: "irrigation", label: "Irrigation" },
  { value: "equipment", label: "Equipment" },
  { value: "staffing", label: "Staffing" },
  { value: "processes", label: "Processes" },
  { value: "aesthetics", label: "Aesthetics" },
  { value: "safety", label: "Safety" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "drainage", label: "Drainage" },
  { value: "pest_disease", label: "Pest/Disease" },
  { value: "member_experience", label: "Member Experience" },
  { value: "other", label: "Other" },
];

const SENTIMENT_OPTIONS: { value: ObservationSentiment; icon: React.ReactNode; label: string; color: string }[] = [
  { value: "negative", icon: <ThumbsDown className="w-4 h-4" />, label: "Needs Work", color: "border-red-400 bg-red-500/10 text-red-700" },
  { value: "positive", icon: <ThumbsUp className="w-4 h-4" />, label: "Like It", color: "border-green-400 bg-green-500/10 text-green-700" },
  { value: "idea", icon: <Lightbulb className="w-4 h-4" />, label: "Idea", color: "border-amber-400 bg-amber-500/10 text-amber-700" },
  { value: "neutral", icon: <StickyNote className="w-4 h-4" />, label: "Note", color: "border-gray-400 bg-gray-500/10 text-gray-700" },
];

export default function ObservationsPage() {
  const { profile: currentUser } = useAuth();
  const {
    observations,
    loading,
    error,
    addObservation,
    updateObservation,
    deleteObservation,
    stats,
  } = useObservations();

  // Quick-add form state
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<ObservationCategory>("turf");
  const [formSentiment, setFormSentiment] = useState<ObservationSentiment>("negative");
  const [formLocation, setFormLocation] = useState("");
  const [formHole, setFormHole] = useState("");
  const [formTags, setFormTags] = useState("");
  const [saving, setSaving] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ObservationCategory | "all">("all");
  const [sentimentFilter, setSentimentFilter] = useState<ObservationSentiment | "all">("all");
  const [addressedFilter, setAddressedFilter] = useState<"all" | "open" | "addressed">("all");
  const [showFilters, setShowFilters] = useState(false);

  // Deleting
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormCategory("turf");
    setFormSentiment("negative");
    setFormLocation("");
    setFormHole("");
    setFormTags("");
  };

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formDescription.trim()) return;
    setSaving(true);

    const result = await addObservation({
      title: formTitle.trim(),
      description: formDescription.trim(),
      category: formCategory,
      sentiment: formSentiment,
      location: formLocation.trim() || null,
      hole_number: formHole ? parseInt(formHole, 10) : null,
      zone_id: null,
      photo_ids: null,
      tags: formTags.trim()
        ? formTags.split(",").map((t) => t.trim()).filter(Boolean)
        : null,
    });

    if (result) {
      resetForm();
      setShowForm(false);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await deleteObservation(id);
    setDeletingId(null);
  };

  const handleToggleAddressed = async (obs: CourseObservation) => {
    await updateObservation(obs.id, { is_addressed: !obs.is_addressed });
  };

  // Filtered list
  const filtered = observations.filter((o) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !o.title.toLowerCase().includes(q) &&
        !o.description.toLowerCase().includes(q) &&
        !(o.location || "").toLowerCase().includes(q) &&
        !(o.tags || []).some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    if (categoryFilter !== "all" && o.category !== categoryFilter) return false;
    if (sentimentFilter !== "all" && o.sentiment !== sentimentFilter) return false;
    if (addressedFilter === "open" && o.is_addressed) return false;
    if (addressedFilter === "addressed" && !o.is_addressed) return false;
    return true;
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header — unified Course Doctor branding */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#1B4332]">Course Doctor</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {stats.total} observation{stats.total !== 1 ? "s" : ""}
            {stats.unaddressed > 0 && (
              <span className="text-amber-600 ml-1">
                ({stats.unaddressed} open)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/observations/walk">
            <Button variant="outline" className="gap-2">
              <Footprints className="w-4 h-4" />
              Course Walk
            </Button>
          </Link>
          <Link href="/observations/plan">
            <Button variant="outline" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              View Plan
            </Button>
          </Link>
          <Button className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" />
            Add Observation
          </Button>
        </div>
      </div>

      {/* Tab Navigation — shared with diagnostics */}
      <div className="flex border-b border-border mb-6">
        <Link
          href="/diagnostics"
          className="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          <span className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            Diagnose
          </span>
        </Link>
        <Link
          href="/observations"
          className="px-4 py-2.5 text-sm font-medium border-b-2 border-[#1B4332] text-[#1B4332]"
        >
          <span className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Observations
          </span>
        </Link>
      </div>

      {/* Quick stats bar */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-200/50">
            <div className="text-2xl font-bold text-red-600">{stats.negative}</div>
            <div className="text-xs text-red-600/80">Needs Work</div>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-200/50">
            <div className="text-2xl font-bold text-green-600">{stats.positive}</div>
            <div className="text-xs text-green-600/80">Looking Good</div>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-200/50">
            <div className="text-2xl font-bold text-amber-600">{stats.ideas}</div>
            <div className="text-xs text-amber-600/80">Ideas</div>
          </div>
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-200/50">
            <div className="text-2xl font-bold text-blue-600">{stats.addressed}</div>
            <div className="text-xs text-blue-600/80">Addressed</div>
          </div>
        </div>
      )}

      {/* Quick-add form */}
      {showForm && (
        <div className="mb-6 p-5 bg-card rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">New Observation</h2>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sentiment selector */}
          <div className="mb-4">
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              What type of observation?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SENTIMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormSentiment(opt.value)}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                    formSentiment === opt.value
                      ? opt.color + " border-current"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Quick summary (e.g. 'Bunker sand is thin on #7')"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full px-4 py-2.5 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="mb-3">
            <textarea
              placeholder="Describe what you see, why it matters, and any context..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none"
            />
          </div>

          {/* Category + Location row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as ObservationCategory)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Location
              </label>
              <input
                type="text"
                placeholder="e.g. Practice green, Clubhouse"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <Hash className="w-3 h-3" /> Hole #
              </label>
              <input
                type="number"
                min={1}
                max={18}
                placeholder="1-18"
                value={formHole}
                onChange={(e) => setFormHole(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Tags (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. priority, drainage, first-impression"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || !formTitle.trim() || !formDescription.trim()}
              className="gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Save Observation
            </Button>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search observations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          className="sm:hidden gap-2"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4" />
          Filters
        </Button>

        <div className={`flex flex-wrap gap-2 ${showFilters ? "flex" : "hidden sm:flex"}`}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ObservationCategory | "all")}
            className="px-3 py-2 border border-input rounded-lg bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All Categories</option>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value as ObservationSentiment | "all")}
            className="px-3 py-2 border border-input rounded-lg bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All Types</option>
            <option value="negative">Needs Work</option>
            <option value="positive">Like It</option>
            <option value="idea">Ideas</option>
            <option value="neutral">Notes</option>
          </select>

          <select
            value={addressedFilter}
            onChange={(e) => setAddressedFilter(e.target.value as "all" | "open" | "addressed")}
            className="px-3 py-2 border border-input rounded-lg bg-background text-base focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="addressed">Addressed</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted/60 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        observations.length === 0 ? (
          <EmptyState
            icon={Eye}
            title="No observations yet"
            description="Walk the course, note what you see. Tap 'Add Observation' to start capturing your first-day impressions."
            action={{ label: "Add Observation", onClick: () => setShowForm(true) }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No matching observations"
            description="Try adjusting your search or filters."
            variant="compact"
          />
        )
      ) : (
        <div className="space-y-3">
          {filtered.map((obs) => {
            const catConfig = observationCategoryConfig[obs.category];
            const sentConfig = sentimentConfig[obs.sentiment];
            return (
              <div
                key={obs.id}
                className={`p-4 rounded-lg border transition-colors ${
                  obs.is_addressed
                    ? "bg-muted/30 border-border/50 opacity-75"
                    : "bg-card border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Sentiment indicator */}
                  <button
                    onClick={() => handleToggleAddressed(obs)}
                    className="mt-0.5 shrink-0"
                    title={obs.is_addressed ? "Mark as open" : "Mark as addressed"}
                  >
                    {obs.is_addressed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${sentConfig.bg} ${sentConfig.color}`}>
                        {sentConfig.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${catConfig.bg} ${catConfig.color}`}>
                        {catConfig.label}
                      </span>
                      {obs.hole_number && (
                        <span className="text-xs text-muted-foreground">
                          Hole #{obs.hole_number}
                        </span>
                      )}
                      {obs.location && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" />
                          {obs.location}
                        </span>
                      )}
                    </div>

                    <h3 className={`font-medium mt-1 ${obs.is_addressed ? "line-through text-muted-foreground" : ""}`}>
                      {obs.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {obs.description}
                    </p>

                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(obs.created_at)}
                      </span>
                      {obs.tags && obs.tags.length > 0 && (
                        <div className="flex gap-1">
                          {obs.tags.slice(0, 3).map((tag, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                          {obs.tags.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{obs.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(obs.id)}
                    disabled={deletingId === obs.id}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    {deletingId === obs.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating action button for mobile - above bottom nav */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] right-6 sm:hidden w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all z-30"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
