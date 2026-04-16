"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ScanLine,
  CheckCircle,
  Link2,
  Loader2,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailPageHeader } from "@/components/ui/back-button";
import { createClient } from "@/lib/supabase/client";
import {
  fy26AssetStatusLabels,
  fy26AssetStatusColors,
  type Fy26Asset,
} from "@/types/fy26-assets";

// Dynamic import for barcode scanner
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Html5Qrcode: any = null;

export default function AssetInventoryPage() {
  const router = useRouter();
  const supabase = createClient();

  const [assets, setAssets] = useState<Fy26Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [barcodeFilter, setBarcodeFilter] = useState<string>("all"); // all | linked | unlinked

  // Scanner state — which asset is currently being scanned
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [savingBarcode, setSavingBarcode] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);

  // Stats
  const totalAssets = assets.length;
  const linkedCount = assets.filter((a) => !!a.barcode_value).length;
  const miaCount = assets.filter((a) => a.status === "mia").length;

  // ── Load all assets ───────────────────────────────────────────────────

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("fy26_assets")
      .select("*")
      .order("site", { ascending: true })
      .order("asset_number", { ascending: true });
    setAssets((data as Fy26Asset[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // ── Filter ────────────────────────────────────────────────────────────

  const filtered = assets.filter((a) => {
    if (siteFilter !== "all" && a.site !== siteFilter) return false;
    if (barcodeFilter === "linked" && !a.barcode_value) return false;
    if (barcodeFilter === "unlinked" && !!a.barcode_value) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        a.description.toLowerCase().includes(q) ||
        a.asset_number.toLowerCase().includes(q) ||
        (a.serial_number && a.serial_number.toLowerCase().includes(q)) ||
        (a.manufacturer && a.manufacturer.toLowerCase().includes(q)) ||
        (a.barcode_value && a.barcode_value.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // ── Save barcode to asset ─────────────────────────────────────────────

  const linkBarcode = async (assetId: string, value: string) => {
    if (!value.trim()) return;
    setSavingBarcode(true);
    const { data, error } = await supabase
      .from("fy26_assets")
      .update({ barcode_value: value.trim() })
      .eq("id", assetId)
      .select()
      .single();

    if (!error && data) {
      setAssets((prev) => prev.map((a) => (a.id === assetId ? (data as Fy26Asset) : a)));
    }
    setSavingBarcode(false);
    stopScanner();
    setScanningId(null);
    setManualBarcode("");
  };

  // ── Scanner lifecycle ─────────────────────────────────────────────────

  const startScanner = async (assetId: string) => {
    setScanningId(assetId);
    setManualBarcode("");

    // Wait for DOM to render the viewport div
    await new Promise((r) => setTimeout(r, 150));

    try {
      if (!Html5Qrcode) {
        const mod = await import("html5-qrcode");
        Html5Qrcode = mod.Html5Qrcode;
      }

      const containerId = `scanner-${assetId}`;
      const el = document.getElementById(containerId);
      if (!el) return;

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 90 }, aspectRatio: 2.5 },
        (decodedText: string) => {
          scanner.stop().then(() => linkBarcode(assetId, decodedText)).catch(() => {});
        },
        () => {}
      );
    } catch {
      // Camera error — user can type manually
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch { /* */ }
      scannerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 pb-24 max-w-3xl mx-auto">
      <DetailPageHeader
        backHref="/inspections"
        backLabel="Back to Inspections"
        title="Asset Inventory"
        subtitle={`${linkedCount}/${totalAssets} barcodes linked \u2022 ${miaCount} MIA`}
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{totalAssets}</p>
            <p className="text-[10px] text-muted-foreground">Total Assets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{linkedCount}</p>
            <p className="text-[10px] text-muted-foreground">Barcodes Linked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-500">{totalAssets - linkedCount}</p>
            <p className="text-[10px] text-muted-foreground">Need Linking</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search asset, serial, manufacturer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger className="w-full sm:w-[170px]">
            <SelectValue placeholder="All Sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            <SelectItem value="7009">7009 Golf Course</SelectItem>
            <SelectItem value="7010">7010 Maintenance</SelectItem>
          </SelectContent>
        </Select>
        <Select value={barcodeFilter} onValueChange={setBarcodeFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unlinked">Need Barcode</SelectItem>
            <SelectItem value="linked">Linked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Asset list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Archive className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No assets match filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((asset) => {
            const isScanning = scanningId === asset.id;
            const hasBarcode = !!asset.barcode_value;
            const statusColor = fy26AssetStatusColors[asset.status];

            return (
              <Card key={asset.id} className="rounded-xl overflow-hidden">
                <CardContent className="p-0">
                  {/* Main row */}
                  <div className="flex items-center gap-3 p-3">
                    {/* Barcode status indicator */}
                    <div className="shrink-0">
                      {hasBarcode ? (
                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                          <Link2 className="w-4 h-4 text-green-600" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                          <ScanLine className="w-4 h-4 text-amber-600" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0" onClick={() => router.push(`/assets/${asset.id}`)}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold truncate">{asset.description}</p>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                          style={{ borderColor: statusColor, color: statusColor }}
                        >
                          {fy26AssetStatusLabels[asset.status]}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                        <span className="font-mono">#{asset.asset_number}</span>
                        <span>Site {asset.site}</span>
                        {asset.manufacturer && <span>{asset.manufacturer}</span>}
                        {asset.serial_number && <span>SN: {asset.serial_number}</span>}
                      </div>
                      {hasBarcode && (
                        <p className="text-[10px] text-green-600 font-mono mt-0.5 truncate">
                          {asset.barcode_value}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {!hasBarcode ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-amber-400 text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            if (isScanning) {
                              stopScanner();
                              setScanningId(null);
                            } else {
                              startScanner(asset.id);
                            }
                          }}
                        >
                          <ScanLine className="w-3.5 h-3.5 mr-1" />
                          {isScanning ? "Cancel" : "Link"}
                        </Button>
                      ) : (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      <button
                        className="p-1.5 text-muted-foreground/40"
                        onClick={() => router.push(`/assets/${asset.id}`)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Inline scanner — shown only for the asset being scanned */}
                  {isScanning && (
                    <div className="border-t border-border bg-muted/30 p-3 space-y-2">
                      <div
                        id={`scanner-${asset.id}`}
                        className="rounded-lg overflow-hidden bg-black min-h-[140px]"
                      />
                      <p className="text-[10px] text-center text-muted-foreground">
                        Point camera at the barcode tag for {asset.description}
                      </p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Or type barcode..."
                          value={manualBarcode}
                          onChange={(e) => setManualBarcode(e.target.value)}
                          className="flex-1 h-8 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && manualBarcode.trim()) {
                              linkBarcode(asset.id, manualBarcode);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          disabled={!manualBarcode.trim() || savingBarcode}
                          onClick={() => linkBarcode(asset.id, manualBarcode)}
                        >
                          {savingBarcode ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
