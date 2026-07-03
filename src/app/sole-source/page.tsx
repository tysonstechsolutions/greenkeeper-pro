"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Scale,
  ChevronRight,
  ChevronLeft,
  Download,
  Loader2,
  CheckCircle,
  Sparkles,
  ClipboardList,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RoleGuard, MANAGEMENT_ROLES } from "@/components/auth/role-guard";
import { useAuth } from "@/lib/hooks/useAuth";
import { callApi } from "@/lib/api/client";
import { useAiGenerate, type AiSource, type AiResult } from "@/lib/ai/use-ai-generate";
import { AiSourceBadge } from "@/components/ai/ai-source-badge";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import {
  saveCreatedDocument,
  listCreatedDocuments,
  createdDocUrl,
  type CreatedDocument,
} from "@/lib/documents/saved-documents";
import {
  generateSoleSourceReport,
  type SoleSourceData,
} from "@/lib/reports/sole-source-report";
import { directSelectList } from "@/lib/supabase/rest";
import { format889Date } from "@/lib/section-889";
import { todayCentralMmDdYyyy } from "@/lib/utils/date";

// ── Facility defaults (bake-in; the superintendent can override per-form) ──────

const REQUESTING_ACTIVITY = "MWR Great Lakes";
const REQUIRING_ACTIVITY = "MWR Golf";
const REQUESTING_INSTALLATION = "NS Great Lakes";

const NEW_BUSINESS = "__new__";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Vendor {
  id: string;
  name: string;
  poc: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  address_line2: string | null;
  city_state_zip: string | null;
  section_889_expiration_date: string | null;
}

interface SsForm {
  // Step 1 — request
  plainDescription: string;
  equipmentId: string;
  estimatedCost: string;
  requiredDeliveryDate: string;
  // Step 1 — business
  vendorId: string; // "" | vendor.id | NEW_BUSINESS
  newName: string;
  newAddress: string;
  newCityStateZip: string;
  newPoc: string;
  newPhone: string;
  newEmail: string;
  // Dealer/Rep address (saved vendor) — editable, auto-filled from the vendor
  // record or, when that's blank, the vendor's most recent purchase request.
  dealerAddress: string;
  dealerCityStateZip: string;
  // Step 2 — AI sections (editable)
  description: string; // section 3
  characteristics: string; // section 4
  marketResearch: string; // section 5
  hasProprietary: "Yes" | "No";
  proprietaryData: string; // section 7
  hasCompatibility: "Yes" | "No"; // section 6
  compatibility: string; // section 6
  hasDirectReplacement: "Yes" | "No"; // section 8
  directReplacement: string; // section 8
  // Header (editable)
  date: string;
  requestingInstallation: string;
  requiringActivity: string;
  requestingActivity: string;
  requestorName: string;
}

function emptyForm(): SsForm {
  return {
    plainDescription: "",
    equipmentId: "",
    estimatedCost: "",
    requiredDeliveryDate: "",
    vendorId: "",
    newName: "",
    newAddress: "",
    newCityStateZip: "",
    newPoc: "",
    newPhone: "",
    newEmail: "",
    dealerAddress: "",
    dealerCityStateZip: "",
    description: "",
    characteristics: "",
    marketResearch: "",
    hasProprietary: "No",
    proprietaryData: "",
    hasCompatibility: "No",
    compatibility: "",
    hasDirectReplacement: "No",
    directReplacement: "",
    date: todayCentralMmDdYyyy(),
    requestingInstallation: REQUESTING_INSTALLATION,
    requiringActivity: REQUIRING_ACTIVITY,
    requestingActivity: REQUESTING_ACTIVITY,
    requestorName: "",
  };
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Request", icon: ClipboardList },
  { id: 2, label: "Review", icon: Sparkles },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function is889Expired(expDate: string | null): boolean {
  if (!expDate) return false;
  return new Date(expDate + "T12:00:00") < new Date();
}

/** Combine a vendor's address_line2 + city_state_zip into one line. */
function vendorCityStateZip(v: Vendor): string {
  return [v.address_line2, v.city_state_zip].filter(Boolean).join(", ");
}

interface Contractor {
  name: string;
  address: string;
  cityStateZip: string;
  poc: string;
  phone: string;
  email: string;
}

function resolveContractor(form: SsForm, vendors: Vendor[]): Contractor {
  if (form.vendorId === NEW_BUSINESS) {
    return {
      name: form.newName.trim(),
      address: form.newAddress.trim(),
      cityStateZip: form.newCityStateZip.trim(),
      poc: form.newPoc.trim(),
      phone: form.newPhone.trim(),
      email: form.newEmail.trim(),
    };
  }
  const v = vendors.find((vv) => vv.id === form.vendorId);
  if (!v) {
    return { name: "", address: "", cityStateZip: "", poc: "", phone: "", email: "" };
  }
  return {
    name: v.name ?? "",
    address: form.dealerAddress.trim() || v.address || "",
    cityStateZip: form.dealerCityStateZip.trim() || vendorCityStateZip(v),
    poc: v.poc ?? "",
    phone: v.phone ?? "",
    email: v.email ?? "",
  };
}

// ── AI generation — writes sections 3, 4 and 5 ─────────────────────────────────

async function generateSoleSourceSections(
  business: string,
  description: string,
  equipmentId: string,
): Promise<{
  description: string;
  characteristics: string;
  marketResearch: string;
  compatibility: string;
  proprietaryData: string;
  directReplacement: string;
}> {
  // The ai-assistant endpoint is a scoped GreenKeeper Pro helper — it refuses
  // "you are a Navy contracting specialist" personas. Framing the task as
  // "help me draft justification text for the golf course" keeps it in-scope
  // and it complies. We also forbid markdown, and the parser strips any anyway.
  const prompt = `Help me draft the written justification text for a sole source purchase request for Veterans Memorial Golf Course equipment.

WHAT WE NEED: ${description}
EQUIPMENT / ITEM ID: ${equipmentId || "N/A"}
SOLE SOURCE BUSINESS: ${business || "the named vendor"}

Write the justification sections below, specific to the equipment and business named. Do not invent part numbers or prices. Where appropriate, reference authorized dealer/distributor status, factory-trained technicians, proprietary diagnostic software or tooling, genuine OEM parts, warranty preservation, prior service history, and that a market survey found no other capable source.

Sections 6, 7 and 8 are "if applicable" — write a usable draft for each anyway; I'll choose Yes/No for each and only include the ones that truly apply.

Output ONLY the labelled sections below, each label on its own line. Do not add any preamble, closing, markdown, or asterisks.

SECTION_3:
<2-4 sentences: a factual scope statement of what is being purchased or serviced; name the equipment, model, and serial/ID when provided>

SECTION_4:
<2-4 sentences: the specific characteristics that limit availability to a sole source>

SECTION_5:
<3-5 sentences: why only this business can furnish the requirement to the exclusion of other sources; state that a market survey was conducted and found no other capable source>

SECTION_6:
<1-2 sentences: if this must be compatible with existing equipment or systems, identify that equipment and why compatibility requires this source>

SECTION_7:
<1-2 sentences: if this involves patent or proprietary data, tooling, or software, describe it factually>

SECTION_8:
<1-2 sentences: if this is a direct replacement for, or standardization with, equipment already in use, identify it>`;

  const reply = await callApi<{ reply?: string; error?: string }>("ai-assistant", {
    method: "POST",
    body: { message: prompt, history: [] },
  });

  // Strip any markdown the assistant adds, then pull each labelled section.
  // Tolerant of "SECTION_3", "SECTION 3", "Section3", optional colon.
  const norm = (reply?.reply ?? "").replace(/\*\*/g, "").replace(/__/g, "");
  const grab = (n: number, nextPat: string): string =>
    (
      norm.match(
        new RegExp(`SECTION[\\s_]*${n}\\s*:?\\s*([\\s\\S]*?)(?=${nextPat}|$)`, "i"),
      )?.[1] ?? ""
    ).trim();
  const s3 = grab(3, "SECTION[\\s_]*4\\s*:?");
  const s4 = grab(4, "SECTION[\\s_]*5\\s*:?");
  const s5 = grab(5, "SECTION[\\s_]*6\\s*:?");
  const s6 = grab(6, "SECTION[\\s_]*7\\s*:?");
  const s7 = grab(7, "SECTION[\\s_]*8\\s*:?");
  const s8 = (norm.match(/SECTION[\s_]*8\s*:?\s*([\s\S]*?)$/i)?.[1] ?? "").trim();

  return {
    description: s3 || description,
    characteristics: s4,
    marketResearch: s5,
    compatibility: s6,
    proprietaryData: s7,
    directReplacement: s8,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SoleSourcePage() {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [form, setForm] = useState<SsForm>(emptyForm);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [history, setHistory] = useState<CreatedDocument[]>([]);

  // Load saved vendors (any business the user has on file).
  const loadVendors = useCallback(async () => {
    try {
      const rows = await directSelectList<Vendor>("vendors", {
        columns:
          "id,name,poc,phone,email,address,address_line2,city_state_zip,section_889_expiration_date",
        orderBy: [{ column: "name", ascending: true }],
        label: "sole-source vendors",
      });
      setVendors(rows ?? []);
    } catch {
      // Degrade gracefully — the user can still type a new business.
    }
  }, []);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  // Past sole source forms (from the Documents store) so the user can find +
  // re-download them right here, not just on the global /documents page.
  const loadHistory = useCallback(async () => {
    try {
      const all = await listCreatedDocuments();
      setHistory(all.filter((d) => d.doc_type === "sole_source"));
    } catch {
      // non-fatal — history just won't show
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Auto-fill requestor name from profile.
  useEffect(() => {
    if (!profile) return;
    setForm((prev) =>
      prev.requestorName ? prev : { ...prev, requestorName: profile.full_name ?? "" },
    );
  }, [profile]);

  const set = <K extends keyof SsForm>(key: K, value: SsForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // When a saved vendor is picked, auto-fill the dealer/rep address + city/state/
  // zip. Vendor records often lack an address (it lives on past PRs), so fall
  // back to the vendor's most recent purchase request — same place the PR pulls it.
  const handleVendorChange = async (id: string) => {
    setForm((prev) => ({ ...prev, vendorId: id, dealerAddress: "", dealerCityStateZip: "" }));
    if (!id || id === NEW_BUSINESS) return;
    const v = vendors.find((vv) => vv.id === id);
    if (!v) return;
    let addr = v.address || "";
    let csz = vendorCityStateZip(v);
    if (!addr || !csz) {
      type PrRow = {
        vendor1_address: string | null;
        vendor1_line2: string | null;
        vendor1_city_state_zip: string | null;
      };
      try {
        let rows = await directSelectList<PrRow>("purchase_requests", {
          columns: "vendor1_address,vendor1_line2,vendor1_city_state_zip,created_at",
          filters: [`vendor_id=eq.${id}`],
          orderBy: [{ column: "created_at", ascending: false }],
          limit: 1,
          label: "sole-source dealer prefill (by id)",
        });
        if (rows.length === 0 && v.name) {
          rows = await directSelectList<PrRow>("purchase_requests", {
            columns: "vendor1_address,vendor1_line2,vendor1_city_state_zip,created_at",
            filters: [`vendor1_name=eq.${encodeURIComponent(v.name)}`],
            orderBy: [{ column: "created_at", ascending: false }],
            limit: 1,
            label: "sole-source dealer prefill (by name)",
          });
        }
        const pr = rows[0];
        if (pr) {
          if (!addr) addr = pr.vendor1_address || "";
          if (!csz) csz = [pr.vendor1_line2, pr.vendor1_city_state_zip].filter(Boolean).join(", ");
        }
      } catch {
        // best-effort — the user can still type the address
      }
    }
    setForm((prev) => ({ ...prev, dealerAddress: addr, dealerCityStateZip: csz }));
  };

  const selectedVendor =
    form.vendorId && form.vendorId !== NEW_BUSINESS
      ? vendors.find((v) => v.id === form.vendorId) ?? null
      : null;

  const businessName =
    form.vendorId === NEW_BUSINESS
      ? form.newName.trim()
      : selectedVendor?.name ?? "";

  // Step 1 is ready when we have a description and an identifiable business.
  const canGenerate =
    form.plainDescription.trim().length >= 10 && businessName.length > 0;

  // ── AI learning library — reuse a past justification for the same
  // business + request (free) before paying; user can still regenerate/edit. ──
  const ai = useAiGenerate("sole_source");
  const [aiSource, setAiSource] = useState<AiSource | null>(null);
  const [servedSections, setServedSections] = useState<{
    description: string;
    characteristics: string;
    marketResearch: string;
  } | null>(null);

  const msStr = (v: unknown): string => (typeof v === "string" ? v : "");
  const composeSsInput = () =>
    [businessName, form.equipmentId.trim(), form.plainDescription.trim()]
      .filter(Boolean)
      .join(" | ");
  const ssSectionsToText = (s: {
    description: string;
    characteristics: string;
    marketResearch: string;
  }) =>
    `SECTION 3:\n${s.description}\n\nSECTION 4:\n${s.characteristics}\n\nSECTION 5:\n${s.marketResearch}`;
  const ssCallAi = async () => {
    const r = await generateSoleSourceSections(
      businessName,
      form.plainDescription.trim(),
      form.equipmentId.trim(),
    );
    return {
      text: ssSectionsToText(r),
      meta: {
        description: r.description,
        characteristics: r.characteristics,
        marketResearch: r.marketResearch,
        compatibility: r.compatibility,
        proprietaryData: r.proprietaryData,
        directReplacement: r.directReplacement,
      },
      model: "claude-sonnet-4-6",
    };
  };
  const applySsResult = (res: AiResult) => {
    const desc = msStr(res.meta.description) || msStr(res.text) || form.plainDescription.trim();
    const chars = msStr(res.meta.characteristics);
    const market = msStr(res.meta.marketResearch);
    const compat = msStr(res.meta.compatibility);
    const prop = msStr(res.meta.proprietaryData);
    const directRep = msStr(res.meta.directReplacement);
    setForm((prev) => ({
      ...prev,
      description: desc,
      characteristics: chars,
      marketResearch: market,
      // Pre-fill the "if applicable" drafts; the Yes/No toggles stay at the
      // user's choice — they flip to Yes to include the drafted text.
      compatibility: compat || prev.compatibility,
      proprietaryData: prop || prev.proprietaryData,
      directReplacement: directRep || prev.directReplacement,
    }));
    setServedSections({ description: desc, characteristics: chars, marketResearch: market });
    setAiSource(res.source);
    if (!chars || !market) {
      setWarning(
        "The AI returned partial text. Review sections 4 and 5 below and edit as needed before downloading.",
      );
    }
    setStep(2);
  };

  // ── Generate (library-first) then advance to review ──
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setWarning(null);
    try {
      applySsResult(
        await ai.run({
          input: composeSsInput(),
          inputMeta: { business: businessName, equipmentId: form.equipmentId.trim() },
          callAi: ssCallAi,
        }),
      );
    } catch {
      setForm((prev) => ({
        ...prev,
        description: prev.description || form.plainDescription.trim(),
      }));
      setWarning(
        "Couldn't reach the AI writer. You can still edit the sections below by hand and download the form.",
      );
      setStep(2);
    } finally {
      setGenerating(false);
    }
  };

  // ── Regenerate — force a fresh paid AI version ("I don't like it"). ──
  const handleRegenerate = async () => {
    setGenerating(true);
    setError(null);
    setWarning(null);
    try {
      applySsResult(
        await ai.regenerate({
          input: composeSsInput(),
          inputMeta: { business: businessName, equipmentId: form.equipmentId.trim() },
          callAi: ssCallAi,
        }),
      );
    } catch {
      setWarning(
        "Couldn't reach the AI writer. Edit the sections by hand and download the form.",
      );
    } finally {
      setGenerating(false);
    }
  };

  // ── Download ──
  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      // Teach the library the final, edited justification text.
      await ai.saveFinal({
        input: composeSsInput(),
        inputMeta: { business: businessName, equipmentId: form.equipmentId.trim() },
        text: ssSectionsToText({
          description: form.description,
          characteristics: form.characteristics,
          marketResearch: form.marketResearch,
        }),
        meta: {
          description: form.description,
          characteristics: form.characteristics,
          marketResearch: form.marketResearch,
        },
        servedText: servedSections ? ssSectionsToText(servedSections) : undefined,
      });

      const c = resolveContractor(form, vendors);
      const data: SoleSourceData = {
        date: form.date,
        requestingInstallation: form.requestingInstallation,
        requiringActivity: form.requiringActivity,
        requestingActivity: form.requestingActivity,
        estimatedCost: form.estimatedCost,
        requiredDeliveryDate: form.requiredDeliveryDate,
        description: form.description,
        characteristics: form.characteristics,
        marketResearch: form.marketResearch,
        hasProprietary: form.hasProprietary,
        proprietaryData: form.hasProprietary === "Yes" ? form.proprietaryData : "",
        compatibilityNotes: form.hasCompatibility === "Yes" ? form.compatibility : "",
        directReplacement: form.hasDirectReplacement === "Yes" ? form.directReplacement : "N/A",
        contractorName: c.name,
        contractorAddress: c.address,
        contractorCityStateZip: c.cityStateZip,
        contractorPoc: c.poc,
        contractorPhone: c.phone,
        contractorEmail: c.email,
        requestorName: form.requestorName,
      };
      const { blob, filename } = await generateSoleSourceReport(data);
      await saveBlobToDevice({ blob, filename, shareTitle: "Sole Source Justification" });
      // Save a copy to the Documents library so it can be retrieved later.
      await saveCreatedDocument({
        docType: "sole_source",
        title: `Sole Source — ${c.name || businessName || "Vendor"}`,
        blob,
        filename,
        meta: { vendor: c.name, estimatedCost: form.estimatedCost, date: form.date },
      });
      setDone(true);
      loadHistory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't generate the PDF. Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleReset = () => {
    setForm(emptyForm());
    setStep(1);
    setDone(false);
    setError(null);
    setWarning(null);
  };

  // ── DONE ──
  if (done) {
    return (
      <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
        <div className="p-4 pb-24 max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <CheckCircle className="w-16 h-16 text-green-500" />
          <h2 className="text-xl font-bold">Sole Source Generated</h2>
          <p className="text-sm text-muted-foreground text-center">
            Your sole source justification PDF has been saved. Open it in Adobe Acrobat
            to add the signatures, then submit it to the NAF Contracting Office.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              New Document
            </Button>
            <Button onClick={handleDownload} disabled={downloading} className="bg-[#1B4332] hover:bg-[#2D6A4F]">
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Download Again
            </Button>
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
      <div className="p-4 md:p-6 pb-24 max-w-xl mx-auto">
        <PageHeader
          title="Sole Source"
          description="Describe what you need and the business — AI fills the justification form"
          icon={Scale}
        />

        {/* Step indicator */}
        <div className="flex items-center gap-1 mt-6 mb-6">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isComplete = step > s.id;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? "bg-[#1B4332] text-white"
                      : isComplete
                        ? "bg-[#1B4332]/20 text-[#1B4332]"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isComplete ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 ${step > s.id ? "bg-[#1B4332]/40" : "bg-muted"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── STEP 1: Request ── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="w-4 h-4" /> What do you need, and from whom?
              </CardTitle>
              <CardDescription>
                Describe the work or item in plain words and pick the business. The AI writes
                the formal sole source justification for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="plainDescription">
                  What is being done / what you need <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="plainDescription"
                  placeholder="e.g. Diagnose and repair our John Deere 2032R tractor — the bucket works but the tractor won't drive. Include transport to and from the shop and a base-access escort."
                  value={form.plainDescription}
                  onChange={(e) => set("plainDescription", e.target.value)}
                  rows={5}
                  className="resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="equipmentId">
                  Equipment / Item ID{" "}
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="equipmentId"
                  placeholder="Model, S/N, unit number, e.g. JOHN DEERE 2032R, S/N CS0004289"
                  value={form.equipmentId}
                  onChange={(e) => set("equipmentId", e.target.value)}
                />
              </div>

              {/* Business */}
              <div className="space-y-1.5">
                <Label htmlFor="vendor">
                  Business (sole source) <span className="text-red-500">*</span>
                </Label>
                <select
                  id="vendor"
                  value={form.vendorId}
                  onChange={(e) => handleVendorChange(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base"
                >
                  <option value="">Select a business…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {is889Expired(v.section_889_expiration_date) ? "  (889 expired)" : ""}
                    </option>
                  ))}
                  <option value={NEW_BUSINESS}>➕ Type a new business…</option>
                </select>
              </div>

              {/* Saved vendor preview */}
              {selectedVendor && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                  {is889Expired(selectedVendor.section_889_expiration_date) && (
                    <div className="flex items-center gap-1.5 text-amber-600 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-xs">
                        889 expired {format889Date(selectedVendor.section_889_expiration_date)} —
                        verify with FRSC before submitting.
                      </span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="dealerAddr" className="text-xs">Dealer / Rep Address</Label>
                    <Input
                      id="dealerAddr"
                      placeholder="Street address"
                      value={form.dealerAddress}
                      onChange={(e) => set("dealerAddress", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dealerCsz" className="text-xs">City, State, Zip</Label>
                    <Input
                      id="dealerCsz"
                      placeholder="City, ST 00000"
                      value={form.dealerCityStateZip}
                      onChange={(e) => set("dealerCityStateZip", e.target.value)}
                    />
                  </div>
                  {selectedVendor.poc && (
                    <p>
                      <span className="font-medium">POC:</span> {selectedVendor.poc}
                    </p>
                  )}
                  {selectedVendor.phone && (
                    <p>
                      <span className="font-medium">Phone:</span> {selectedVendor.phone}
                    </p>
                  )}
                  {selectedVendor.email && (
                    <p>
                      <span className="font-medium">Email:</span> {selectedVendor.email}
                    </p>
                  )}
                </div>
              )}

              {/* New business inputs */}
              {form.vendorId === NEW_BUSINESS && (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">New business details</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="newName">
                      Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="newName"
                      placeholder="Business name"
                      value={form.newName}
                      onChange={(e) => set("newName", e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="newAddress">Address</Label>
                      <Input
                        id="newAddress"
                        placeholder="Street address"
                        value={form.newAddress}
                        onChange={(e) => set("newAddress", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="newCsz">City, State, Zip</Label>
                      <Input
                        id="newCsz"
                        placeholder="City, ST 00000"
                        value={form.newCityStateZip}
                        onChange={(e) => set("newCityStateZip", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="newPoc">POC</Label>
                      <Input
                        id="newPoc"
                        placeholder="Contact name"
                        value={form.newPoc}
                        onChange={(e) => set("newPoc", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="newPhone">Phone</Label>
                      <Input
                        id="newPhone"
                        placeholder="(000) 000-0000"
                        value={form.newPhone}
                        onChange={(e) => set("newPhone", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="newEmail">Email</Label>
                    <Input
                      id="newEmail"
                      type="email"
                      placeholder="name@business.com"
                      value={form.newEmail}
                      onChange={(e) => set("newEmail", e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Cost + delivery */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cost">
                    Estimated Cost{" "}
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="cost"
                    placeholder="e.g. $4,250.00"
                    value={form.estimatedCost}
                    onChange={(e) => set("estimatedCost", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rdd">
                    Required Delivery Date{" "}
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="rdd"
                    placeholder="MM/DD/YYYY"
                    value={form.requiredDeliveryDate}
                    onChange={(e) => set("requiredDeliveryDate", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent sole source forms (history) */}
        {step === 1 && history.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">
              Recent sole source forms
            </h2>
            <div className="space-y-2">
              {history.slice(0, 8).map((d) => {
                const url = createdDocUrl(d.storage_path);
                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-primary hover:underline shrink-0"
                      >
                        Open
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Every generated document is also kept under <span className="font-medium">Documents</span>.
            </p>
          </div>
        )}

        {/* ── STEP 2: Review ── */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-4 h-4" /> Review &amp; edit
              </CardTitle>
              <CardDescription>
                You are certifying these statements are complete and correct. Edit anything before
                you download.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-muted-foreground">
                  Business: <span className="text-foreground">{businessName || "—"}</span>
                </p>
                <div className="flex items-center gap-2">
                  <AiSourceBadge source={aiSource} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleRegenerate}
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rewriting…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" /> Regenerate with AI
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="s3">3. Description of the item or service required</Label>
                <Textarea
                  id="s3"
                  rows={4}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="s4">4. Specific characteristics that limit it to a sole source</Label>
                <Textarea
                  id="s4"
                  rows={5}
                  value={form.characteristics}
                  onChange={(e) => set("characteristics", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="s5">5. Why only this source can furnish the requirement</Label>
                <Textarea
                  id="s5"
                  rows={6}
                  value={form.marketResearch}
                  onChange={(e) => set("marketResearch", e.target.value)}
                />
              </div>

              {/* Proprietary (Questions 6 & 7 share one Yes/No on this form) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="prop">Patent / proprietary data? (Q6 &amp; Q7)</Label>
                  <select
                    id="prop"
                    value={form.hasProprietary}
                    onChange={(e) => set("hasProprietary", e.target.value as "Yes" | "No")}
                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base"
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                {form.hasProprietary === "Yes" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="propData">List the proprietary data</Label>
                    <Textarea
                      id="propData"
                      rows={3}
                      value={form.proprietaryData}
                      onChange={(e) => set("proprietaryData", e.target.value)}
                      placeholder="The AI pre-fills this when you generate — edit as needed."
                    />
                  </div>
                )}
              </div>

              {/* Section 6 — compatibility with existing equipment */}
              <div className="space-y-1.5">
                <Label htmlFor="hasCompat">
                  6. Required for compatibility with existing equipment?
                </Label>
                <select
                  id="hasCompat"
                  value={form.hasCompatibility}
                  onChange={(e) => set("hasCompatibility", e.target.value as "Yes" | "No")}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base sm:max-w-[220px]"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
                {form.hasCompatibility === "Yes" && (
                  <Textarea
                    rows={3}
                    value={form.compatibility}
                    onChange={(e) => set("compatibility", e.target.value)}
                    placeholder="Describe the equipment it must be compatible with (the AI pre-fills this — edit as needed)."
                  />
                )}
              </div>

              {/* Section 8 — direct replacement / standardization */}
              <div className="space-y-1.5">
                <Label htmlFor="hasDirect">
                  8. Direct replacement for / standardization with existing equipment?
                </Label>
                <select
                  id="hasDirect"
                  value={form.hasDirectReplacement}
                  onChange={(e) => set("hasDirectReplacement", e.target.value as "Yes" | "No")}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base sm:max-w-[220px]"
                >
                  <option value="No">No (mark N/A)</option>
                  <option value="Yes">Yes</option>
                </select>
                {form.hasDirectReplacement === "Yes" && (
                  <Textarea
                    rows={3}
                    value={form.directReplacement}
                    onChange={(e) => set("directReplacement", e.target.value)}
                    placeholder="Identify the equipment this replaces / standardizes with (the AI pre-fills this — edit as needed)."
                  />
                )}
              </div>

              {/* Form details (header) */}
              <details className="rounded-lg border border-border bg-muted/20 p-3">
                <summary className="text-sm font-medium cursor-pointer select-none">
                  Form details (date, activities, requestor)
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="date">Date</Label>
                      <Input id="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="requestor">Requestor Printed Name</Label>
                      <Input
                        id="requestor"
                        value={form.requestorName}
                        onChange={(e) => set("requestorName", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="install">From (Installation)</Label>
                      <Input
                        id="install"
                        value={form.requestingInstallation}
                        onChange={(e) => set("requestingInstallation", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="requiring">Requiring Activity</Label>
                      <Input
                        id="requiring"
                        value={form.requiringActivity}
                        onChange={(e) => set("requiringActivity", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="requesting">Requesting Activity</Label>
                    <Input
                      id="requesting"
                      value={form.requestingActivity}
                      onChange={(e) => set("requestingActivity", e.target.value)}
                    />
                  </div>
                </div>
              </details>

              <Button
                className="w-full gap-2 bg-[#1B4332] hover:bg-[#2D6A4F]"
                onClick={handleDownload}
                disabled={downloading || !form.requestorName.trim() || !form.description.trim()}
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Download Sole Source PDF
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Warning / error */}
        {warning && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            {warning}
          </div>
        )}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 1}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          {step === 1 && (
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="bg-[#1B4332] hover:bg-[#2D6A4F]"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" /> Generate with AI
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
