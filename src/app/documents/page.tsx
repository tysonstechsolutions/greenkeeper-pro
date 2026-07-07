"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FolderOpen,
  FileText,
  Loader2,
  Search,
  Trash2,
  ExternalLink,
  RefreshCw,
  PencilLine,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listCreatedDocuments,
  deleteCreatedDocument,
  createdDocUrl,
  docTypeLabel,
  type CreatedDocument,
} from "@/lib/documents/saved-documents";

/** Docs that store their form data can be reopened for editing. */
function editHref(d: CreatedDocument): string | null {
  if (d.doc_type === "sf52" && d.meta && typeof d.meta === "object" && "form" in d.meta) {
    return `/staff/sf52?doc=${d.id}`;
  }
  return null;
}

function fmt(s: string): string {
  const dt = new Date(s);
  return Number.isNaN(dt.getTime())
    ? s
    : dt.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<CreatedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDocs(await listCreatedDocuments());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const types = useMemo(
    () => Array.from(new Set(docs.map((d) => d.doc_type))).sort(),
    [docs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (typeFilter !== "all" && d.doc_type !== typeFilter) return false;
      if (
        q &&
        !d.title.toLowerCase().includes(q) &&
        !(d.filename || "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [docs, search, typeFilter]);

  const remove = async (d: CreatedDocument) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete the saved copy of "${d.title}"?`))
      return;
    setBusyId(d.id);
    try {
      await deleteCreatedDocument(d);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24 max-w-3xl mx-auto">
      <PageHeader
        title="Documents"
        description="Every document the app has created — open or re-download any of them anytime."
        icon={FolderOpen}
      />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 mt-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-input bg-background text-base"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {docTypeLabel(t)}
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

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {docs.length === 0
                ? "Nothing here yet. As you create sole-source forms, SOWs, and onboarding packets, a copy of each lands here automatically."
                : "No documents match your filter."}
            </CardContent>
          </Card>
        ) : (
          filtered.map((d) => {
            const url = createdDocUrl(d.storage_path);
            return (
              <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border">
                <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">{docTypeLabel(d.doc_type)}</span> · {fmt(d.created_at)}
                  </p>
                </div>
                {(() => {
                  const href = editHref(d);
                  return href ? (
                    <Link
                      href={href}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm hover:bg-muted/60"
                    >
                      <PencilLine className="w-4 h-4" /> Edit
                    </Link>
                  ) : null;
                })()}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm hover:bg-muted/60"
                  >
                    <ExternalLink className="w-4 h-4" /> Open
                  </a>
                )}
                <button
                  onClick={() => remove(d)}
                  disabled={busyId === d.id}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted/60 text-red-600"
                  aria-label="Delete"
                >
                  {busyId === d.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
