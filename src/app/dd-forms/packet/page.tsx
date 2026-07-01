"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Sparkles,
  CheckCircle,
  Package,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFy26Assets } from "@/lib/hooks/useFy26Assets";
import { DD200_CIRCUMSTANCES, DD200_CATEGORIES } from "@/lib/dd-forms/constants";
import {
  defaultDispositionReason,
  usesPhotoReason,
  type Circumstance,
} from "@/lib/dd-forms/reasons";
import { draftDamageReason } from "@/lib/dd-forms/ai";
import {
  buildDispositionPacket,
  collectAssetPhotos,
  type PacketItem,
} from "@/lib/dd-forms/packet";
import { buildDispositionItem } from "@/lib/dd-forms/from-asset";
import { saveCreatedDocument } from "@/lib/documents/saved-documents";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import type { Fy26Asset } from "@/types/fy26-assets";

type Category = (typeof DD200_CATEGORIES)[number]["key"];
const selectCls = "px-2 py-1.5 rounded-lg border border-input bg-background text-sm";

interface ItemConfig {
  selected: boolean;
  circumstance: Circumstance;
  category: Category;
  reason: string;
}

const ALL_DEFAULTS = new Set<string>([
  defaultDispositionReason("lost"),
  defaultDispositionReason("damaged"),
  defaultDispositionReason("destroyed"),
  "",
]);

export default function DispositionPacketPage() {
  const { fetchAssets } = useFy26Assets();
  const [assets, setAssets] = useState<Fy26Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, ItemConfig>>({});
  const [busy, setBusy] = useState(false);
  const [draftingAll, setDraftingAll] = useState(false);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAssets({ status: "needs_disposed" })
      .then((rows) => {
        if (cancelled) return;
        setAssets(rows);
        const initial: Record<string, ItemConfig> = {};
        for (const a of rows) {
          initial[a.id] = {
            selected: false,
            circumstance: "destroyed",
            category: "organization",
            reason: defaultDispositionReason("destroyed"),
          };
        }
        setConfig(initial);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load assets to dispose.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAssets]);

  const selectedItems = useMemo(
    () => assets.filter((a) => config[a.id]?.selected),
    [assets, config],
  );

  function patch(id: string, next: Partial<ItemConfig>) {
    setConfig((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }

  function setCircumstance(id: string, circumstance: Circumstance) {
    setConfig((prev) => {
      const cur = prev[id];
      // Only refresh the reason if it's still an unedited default.
      const reason = ALL_DEFAULTS.has(cur.reason.trim())
        ? defaultDispositionReason(circumstance)
        : cur.reason;
      return { ...prev, [id]: { ...cur, circumstance, reason } };
    });
  }

  async function draftOne(asset: Fy26Asset) {
    const cfg = config[asset.id];
    if (!cfg || !usesPhotoReason(cfg.circumstance)) return;
    setDraftingId(asset.id);
    try {
      const reason = await draftDamageReason(asset, cfg.circumstance, buildDispositionItem(asset));
      patch(asset.id, { reason });
    } finally {
      setDraftingId(null);
    }
  }

  async function draftAll() {
    setDraftingAll(true);
    try {
      for (const a of selectedItems) {
        const cfg = config[a.id];
        if (!cfg || !usesPhotoReason(cfg.circumstance)) continue;
        const reason = await draftDamageReason(a, cfg.circumstance, buildDispositionItem(a));
        patch(a.id, { reason });
      }
    } finally {
      setDraftingAll(false);
    }
  }

  async function generate() {
    if (selectedItems.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const items: PacketItem[] = selectedItems.map((a) => {
        const cfg = config[a.id];
        return {
          asset: a,
          circumstance: cfg.circumstance,
          category: cfg.category,
          reason: cfg.reason.trim() || defaultDispositionReason(cfg.circumstance),
        };
      });
      const { blob, filename, photoPages, skippedPhotos } = await buildDispositionPacket(items);
      await saveCreatedDocument({
        docType: "dd2212",
        title: `Disposition packet — ${items.length} item${items.length === 1 ? "" : "s"}`,
        blob,
        filename,
        meta: { source: "disposition-packet", items: items.length },
      });
      await saveBlobToDevice({ blob, filename, shareTitle: filename });
      setResult(
        `Built ${filename} — 1 DD-2212 (${Math.ceil(items.length / 24)} sheet${
          items.length > 24 ? "s" : ""
        }) + ${items.length} DD-200${items.length === 1 ? "" : "s"} + ${photoPages} photo page${
          photoPages === 1 ? "" : "s"
        }${skippedPhotos ? ` (${skippedPhotos} photo${skippedPhotos === 1 ? "" : "s"} couldn't be added)` : ""}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build the packet. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-3 md:p-6 pb-28 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Link href="/dd-forms/2212" className="p-1.5 rounded-lg hover:bg-muted" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Package className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold leading-tight">Disposition Packet</h1>
          <p className="text-xs text-muted-foreground">
            One 2212 + a DD-200 &amp; photos per item, in a single download
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {result && (
        <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> {result}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading assets…
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm font-medium">No assets marked &quot;needs disposed&quot;</p>
          <p className="text-xs text-muted-foreground mt-1">
            Mark assets for disposal on the Assets list first.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">
              {selectedItems.length} of {assets.length} selected
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setConfig((prev) => {
                    const all = selectedItems.length !== assets.length;
                    const next = { ...prev };
                    for (const a of assets) next[a.id] = { ...next[a.id], selected: all };
                    return next;
                  })
                }
                className="text-xs text-primary font-medium hover:underline"
              >
                {selectedItems.length === assets.length ? "Clear all" : "Select all"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {assets.map((a) => {
              const cfg = config[a.id];
              if (!cfg) return null;
              const photos = collectAssetPhotos(a);
              return (
                <div
                  key={a.id}
                  className={`rounded-xl border p-3 ${
                    cfg.selected ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.selected}
                      onChange={(e) => patch(a.id, { selected: e.target.checked })}
                      className="w-4 h-4 mt-1 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{a.description}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Asset {a.asset_number} · Site {a.site}
                        {a.original_value != null ? ` · $${a.original_value.toLocaleString()}` : ""}
                        {" · "}
                        {photos.length} photo{photos.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </label>

                  {cfg.selected && (
                    <div className="mt-3 pl-7 space-y-2">
                      {photos.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                          {photos.map((url) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={url}
                              src={url}
                              alt=""
                              className="w-14 h-14 rounded-md object-cover border border-border"
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Circumstance (9)</Label>
                          <select
                            value={cfg.circumstance}
                            onChange={(e) => setCircumstance(a.id, e.target.value as Circumstance)}
                            className={`${selectCls} block mt-0.5`}
                          >
                            {DD200_CIRCUMSTANCES.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Category</Label>
                          <select
                            value={cfg.category}
                            onChange={(e) => patch(a.id, { category: e.target.value as Category })}
                            className={`${selectCls} block mt-0.5`}
                          >
                            {DD200_CATEGORIES.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] text-muted-foreground">Reason</Label>
                          {usesPhotoReason(cfg.circumstance) && photos.length > 0 && (
                            <button
                              type="button"
                              onClick={() => draftOne(a)}
                              disabled={draftingId === a.id || draftingAll}
                              className="text-[11px] text-primary font-medium inline-flex items-center gap-1 hover:underline disabled:opacity-50"
                            >
                              {draftingId === a.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              Draft from photo
                            </button>
                          )}
                        </div>
                        <Textarea
                          rows={2}
                          value={cfg.reason}
                          onChange={(e) => patch(a.id, { reason: e.target.value })}
                          className="mt-0.5 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Sticky action bar */}
      {!loading && assets.length > 0 && (
        <div className="fixed bottom-20 md:bottom-4 left-0 right-0 z-40 px-3">
          <div className="max-w-3xl mx-auto flex gap-2 rounded-xl border border-border bg-background/95 backdrop-blur p-2 shadow-lg">
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={draftAll}
              disabled={draftingAll || busy || selectedItems.every((a) => !usesPhotoReason(config[a.id]?.circumstance))}
            >
              {draftingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="hidden sm:inline">Draft reasons</span>
            </Button>
            <div className="flex-1" />
            <Button
              className="gap-1.5 bg-[#1B4332] hover:bg-[#2D6A4F]"
              onClick={generate}
              disabled={busy || selectedItems.length === 0}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Generate packet ({selectedItems.length})
            </Button>
          </div>
        </div>
      )}

      {selectedItems.length > 24 && (
        <p className="mt-3 text-[11px] text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Over 24 items — the 2212 will span multiple sheets.
        </p>
      )}
    </div>
  );
}
