"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Library,
  Loader2,
  Search,
  Trash2,
  Pencil,
  Save,
  X,
  RefreshCw,
  PiggyBank,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiSourceBadge } from "@/components/ai/ai-source-badge";
import {
  listLibrary,
  updateLibraryEntry,
  deleteLibraryEntry,
  type LibraryEntry,
} from "@/lib/ai/library";

const FEATURE_LABELS: Record<string, string> = {
  work_order: "Work Orders",
  fix_instructions: "Fix Instructions — Holes",
  green_fix_instructions: "Fix Instructions — Greens",
  sole_source: "Sole Source",
  sow: "Statement of Work",
};

// Rough per-generation cost, only to give the savings number a sense of scale.
const APPROX_COST_PER_GEN = 0.03;

function featureLabel(f: string): string {
  return FEATURE_LABELS[f] ?? f;
}

function sourceForBadge(s: LibraryEntry["source"]): "library" | "ai" | "fallback" {
  // The library page reuses the badge component; map storage source → badge.
  if (s === "edited") return "library";
  if (s === "manual") return "fallback";
  return "ai";
}

/** Re-derive structured sections from edited combined text for multi-section features. */
function reparseMeta(feature: string, text: string): Record<string, unknown> | null {
  const grab = (label: string, next: string) => {
    const re = new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)(?=${next}|$)`, "i");
    return (text.match(re)?.[1] ?? "").trim();
  };
  if (feature === "sole_source") {
    return {
      description: grab("SECTION[\\s_]*3", "SECTION[\\s_]*4\\s*:?"),
      characteristics: grab("SECTION[\\s_]*4", "SECTION[\\s_]*5\\s*:?"),
      marketResearch: grab("SECTION[\\s_]*5", "ZZZ_NO_MATCH"),
    };
  }
  if (feature === "sow") {
    return {
      expectation: grab("EXPECTATION", "DESCRIPTION_OF_GOODS\\s*:?"),
      goods: grab("DESCRIPTION_OF_GOODS", "CERTIFICATIONS\\s*:?"),
      certifications: grab("CERTIFICATIONS", "ZZZ_NO_MATCH"),
    };
  }
  return null; // single-text features keep their existing meta
}

export default function AiLibraryPage() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [featureFilter, setFeatureFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listLibrary());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const reuses = entries.reduce((sum, e) => sum + (e.use_count || 0), 0);
    const paid = entries.filter((e) => e.source === "ai").length;
    return { total: entries.length, reuses, paid, saved: reuses * APPROX_COST_PER_GEN };
  }, [entries]);

  const features = useMemo(() => {
    const set = new Set(entries.map((e) => e.feature));
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (featureFilter !== "all" && e.feature !== featureFilter) return false;
      if (!q) return true;
      return (
        e.input_text.toLowerCase().includes(q) || e.output_text.toLowerCase().includes(q)
      );
    });
  }, [entries, search, featureFilter]);

  const startEdit = (e: LibraryEntry) => {
    setEditingId(e.id);
    setEditText(e.output_text);
  };

  const saveEdit = async (e: LibraryEntry) => {
    setBusyId(e.id);
    try {
      const meta = reparseMeta(e.feature, editText);
      await updateLibraryEntry(e.id, {
        output_text: editText,
        ...(meta ? { output_meta: meta } : {}),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the change.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (e: LibraryEntry) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this saved answer?")) return;
    setBusyId(e.id);
    try {
      await deleteLibraryEntry(e.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24 max-w-3xl mx-auto">
      <PageHeader
        title="AI Library"
        description="Answers the app has learned. They're reused for free before paying for new AI."
        icon={Library}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Saved answers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-700">{stats.reuses}</p>
            <p className="text-xs text-muted-foreground">Free reuses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-700">{stats.paid}</p>
            <p className="text-xs text-muted-foreground">Paid generations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold flex items-center gap-1">
              <PiggyBank className="w-5 h-5 text-green-600" />~${stats.saved.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Approx. saved</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 mt-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search saved answers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={featureFilter}
          onChange={(e) => setFeatureFilter(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-input bg-background text-base"
        >
          <option value="all">All features</option>
          {features.map((f) => (
            <option key={f} value={f}>
              {featureLabel(f)}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* List */}
      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {entries.length === 0
                ? "Nothing learned yet. As you generate work orders, fix instructions, sole-source and SOW text, the answers you keep land here and get reused for free."
                : "No saved answers match your filter."}
            </CardContent>
          </Card>
        ) : (
          filtered.map((e) => (
            <Card key={e.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted">
                      {featureLabel(e.feature)}
                    </span>
                    <AiSourceBadge source={sourceForBadge(e.source)} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Reused {e.use_count}×
                  </span>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2">
                  <span className="font-medium text-foreground">Request:</span> {e.input_text}
                </p>

                {editingId === e.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(ev) => setEditText(ev.target.value)}
                      rows={8}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(e)} disabled={busyId === e.id} className="gap-1.5">
                        {busyId === e.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="gap-1.5">
                        <X className="w-3.5 h-3.5" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-line line-clamp-4 bg-muted/30 rounded-lg p-3">
                      {e.output_text}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(e)} className="gap-1.5">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => remove(e)}
                        disabled={busyId === e.id}
                        className="gap-1.5 text-red-600 hover:text-red-700"
                      >
                        {busyId === e.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
