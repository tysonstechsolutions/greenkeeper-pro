"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, FileText, CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import { saveCreatedDocument } from "@/lib/documents/saved-documents";
import { generateDd200Report, dd200Filename, type Dd200Data } from "@/lib/reports/dd200-report";
import { DD200_ORG_ADDRESS } from "@/lib/dd-forms/dd200-fields";
import { draftDd200Narratives } from "@/lib/dd-forms/ai";
import {
  DD_SITES,
  DD200_CIRCUMSTANCES,
  DD200_CATEGORIES,
  ymd,
  mdy,
  money,
  type DdSite,
} from "@/lib/dd-forms/constants";

const selectCls = "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base";

type Circumstance = (typeof DD200_CIRCUMSTANCES)[number]["key"];
type Category = (typeof DD200_CATEGORIES)[number]["key"];

function Dd200Content() {
  const router = useRouter();
  const params = useSearchParams();

  const [site, setSite] = useState<DdSite>(DD_SITES[0]);
  const [assetName, setAssetName] = useState(params.get("asset") || "");

  const [dateInitiated, setDateInitiated] = useState(ymd());
  const [inquiryNumber, setInquiryNumber] = useState("");
  const [dateLossDiscovered, setDateLossDiscovered] = useState("");
  const [nsn, setNsn] = useState("");
  const [itemDescription, setItemDescription] = useState(params.get("item") || "");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [totalTouched, setTotalTouched] = useState(false);

  const [circumstance, setCircumstance] = useState<Circumstance | "">("");
  const [category, setCategory] = useState<Category | "">("");

  const [circumstances, setCircumstances] = useState("");
  const [actions, setActions] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const [orgAddress, setOrgAddress] = useState(DD200_ORG_ADDRESS);
  const [typedName, setTypedName] = useState("");
  const [dsn, setDsn] = useState("");
  const [dateSigned, setDateSigned] = useState(mdy());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onQtyCost(next: { quantity?: string; unitCost?: string }) {
    const q = next.quantity ?? quantity;
    const c = next.unitCost ?? unitCost;
    if (next.quantity !== undefined) setQuantity(next.quantity);
    if (next.unitCost !== undefined) setUnitCost(next.unitCost);
    if (!totalTouched) {
      const t = money(q, c, true);
      if (t) setTotalCost(t);
    }
  }

  async function handleDraft() {
    setDrafting(true);
    setAiNote(null);
    try {
      const disposition = DD200_CIRCUMSTANCES.find((c) => c.key === circumstance)?.label || "";
      const out = await draftDd200Narratives({ item: itemDescription, disposition, whatHappened });
      if (out) {
        if (out.circumstances) setCircumstances(out.circumstances);
        if (out.actions) setActions(out.actions);
        setAiNote("Drafted — review and edit before generating.");
      } else {
        setAiNote("AI drafting isn't available right now — type the narratives below.");
      }
    } finally {
      setDrafting(false);
    }
  }

  const canGenerate = !!assetName.trim() && !!itemDescription.trim();

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const data: Dd200Data = {
        dateInitiated,
        inquiryNumber,
        dateLossDiscovered,
        nsn,
        itemDescription,
        quantity,
        unitCost,
        totalCost,
        circumstance: circumstance || undefined,
        category: category || undefined,
        circumstances,
        actions,
        orgAddress,
        typedName,
        dsn,
        dateSigned,
      };
      const filename = dd200Filename(site, assetName);
      const { blob } = await generateDd200Report(data, filename);
      await saveBlobToDevice({ blob, filename, shareTitle: filename });
      await saveCreatedDocument({
        docType: "dd200",
        title: `DD-200 — ${assetName} (Site ${site})`,
        blob,
        filename,
        meta: { site, circumstance: circumstance || null },
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate the DD-200.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-6 pb-28 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#1B4332]" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Financial Liability Investigation</h1>
            <p className="text-xs text-muted-foreground">DD Form 200 — Property Loss</p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="site">Site number</Label>
            <select id="site" value={site} onChange={(e) => setSite(e.target.value as DdSite)} className={selectCls}>
              {DD_SITES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset">Asset / item name (for the file name)</Label>
            <Input id="asset" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="e.g. 52in TV" />
          </div>
        </div>

        {/* Dates + inquiry number */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="di">1. Date initiated</Label>
            <Input id="di" value={dateInitiated} onChange={(e) => setDateInitiated(e.target.value)} placeholder="YYYYMMDD" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inq">2. Inquiry / investigation no.</Label>
            <Input id="inq" value={inquiryNumber} onChange={(e) => setInquiryNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dl">3. Date loss discovered</Label>
            <Input id="dl" value={dateLossDiscovered} onChange={(e) => setDateLossDiscovered(e.target.value)} placeholder="YYYYMMDD" />
          </div>
        </div>

        {/* Item */}
        <div className="space-y-1.5">
          <Label htmlFor="nsn">4. National stock no. (optional)</Label>
          <Input id="nsn" value={nsn} onChange={(e) => setNsn(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desc">5. Item description</Label>
          <Input id="desc" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="qty">6. Quantity</Label>
            <Input id="qty" value={quantity} onChange={(e) => onQtyCost({ quantity: e.target.value })} inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="uc">7. Unit cost</Label>
            <Input id="uc" value={unitCost} onChange={(e) => onQtyCost({ unitCost: e.target.value })} inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tc">8. Total cost</Label>
            <Input id="tc" value={totalCost} onChange={(e) => { setTotalCost(e.target.value); setTotalTouched(true); }} inputMode="decimal" />
          </div>
        </div>

        {/* Block 9 selections */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="circ">9. Property was (X one)</Label>
            <select id="circ" value={circumstance} onChange={(e) => setCircumstance(e.target.value as Circumstance | "")} className={selectCls}>
              <option value="">— Select —</option>
              {DD200_CIRCUMSTANCES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat">Category (X one)</Label>
            <select id="cat" value={category} onChange={(e) => setCategory(e.target.value as Category | "")} className={selectCls}>
              <option value="">— Select —</option>
              {DD200_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* AI draft helper */}
        <div className="rounded-xl border border-border p-3 space-y-2 bg-muted/30">
          <Label htmlFor="what" className="text-xs">What happened? (a few notes — AI can draft the narratives)</Label>
          <Textarea id="what" rows={2} value={whatHappened} onChange={(e) => setWhatHappened(e.target.value)} placeholder="e.g. TV stopped turning on, beyond repair, disposed in 2020, paperwork never filed" />
          <Button type="button" variant="outline" size="sm" onClick={handleDraft} disabled={drafting}>
            {drafting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            Draft narratives with AI
          </Button>
          {aiNote && <p className="text-xs text-muted-foreground">{aiNote}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="circtext">9. Circumstances</Label>
          <Textarea id="circtext" rows={4} value={circumstances} onChange={(e) => setCircumstances(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acttext">10. Actions taken to correct / prevent recurrence</Label>
          <Textarea id="acttext" rows={3} value={actions} onChange={(e) => setActions(e.target.value)} />
        </div>

        {/* Block 11 */}
        <div className="space-y-1.5">
          <Label htmlFor="org">11a. Organizational address</Label>
          <Textarea id="org" rows={4} value={orgAddress} onChange={(e) => setOrgAddress(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">11b. Typed name (Last, First MI)</Label>
            <Input id="name" value={typedName} onChange={(e) => setTypedName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dsn">11c. DSN (optional)</Label>
            <Input id="dsn" value={dsn} onChange={(e) => setDsn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds">11e. Date signed</Label>
            <Input id="ds" value={dateSigned} onChange={(e) => setDateSigned(e.target.value)} placeholder="MMDDYYYY" />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Blocks 12–14 and page 2 (reviewing / appointing / approving authorities and the
          financial-liability officer&apos;s findings) are left blank — they&apos;re signed up the chain.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" /> Saved to Documents and downloaded.
          </p>
        )}

        <Button onClick={handleGenerate} disabled={!canGenerate || busy} className="w-full">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
          Generate DD-200 (PDF)
        </Button>
      </div>
    </div>
  );
}

export default function Dd200Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <Dd200Content />
    </Suspense>
  );
}
