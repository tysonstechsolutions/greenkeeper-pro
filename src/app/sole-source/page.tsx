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
  Building2,
  ClipboardList,
  User,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoleGuard, MANAGEMENT_ROLES } from "@/components/auth/role-guard";
import { useAuth } from "@/lib/hooks/useAuth";
import { callApi } from "@/lib/api/client";
import { downloadSoleSourceReport, type SoleSourceData } from "@/lib/reports/sole-source-report";
import { directSelectList } from "@/lib/supabase/rest";
import { format889Date } from "@/lib/section-889";
import { todayLocal } from "@/lib/utils/date";

// ── Constants ─────────────────────────────────────────────────────────────────

const REQUESTING_ACTIVITY    = "MWR Great Lakes";
const REQUIRING_ACTIVITY     = "MWR Golf";
const REQUESTING_INSTALLATION = "NS Great Lakes";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Vendor889 {
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

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Contractor",    icon: Building2 },
  { id: 2, label: "Work Details",  icon: ClipboardList },
  { id: 3, label: "Requestor",     icon: User },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function is889Expired(expDate: string | null): boolean {
  if (!expDate) return false;
  return new Date(expDate + "T12:00:00") < new Date();
}

function emptyForm(): Omit<SoleSourceData, "contractorName" | "contractorAddress" | "contractorCityStateZip" | "contractorPoc" | "contractorPhone" | "contractorEmail"> & {
  vendorId: string;
} {
  return {
    vendorId: "",
    requestingActivity:    REQUESTING_ACTIVITY,
    requiringActivity:     REQUIRING_ACTIVITY,
    requestingInstallation: REQUESTING_INSTALLATION,
    date: new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }),
    estimatedCost: "",
    requiredDeliveryDate: "",
    description: "",
    additionalDescription: "",
    marketResearch: "",
    equipmentId: "",
    hasProprietary: "No",
    proprietaryData: "",
    equipmentOther: "N/A",
    manufacturerName: "",
    manufacturerPoc: "",
    manufacturerPhone: "",
    manufacturerEmail: "",
    manufacturerAddress: "",
    manufacturerAddress1: "",
    requestorName: "",
  };
}

// ── AI generation ─────────────────────────────────────────────────────────────

async function generateJustification(
  vendorName: string,
  description: string,
  equipmentId: string,
): Promise<{ additional: string; marketResearch: string }> {
  const prompt = `You are a Navy MWR contracting specialist writing a Sole Source justification.

VENDOR: ${vendorName}
ITEM/SERVICE DESCRIPTION: ${description}
EQUIPMENT/ITEM ID: ${equipmentId || "N/A"}

Provide two sections formatted EXACTLY as shown:

ADDITIONAL_DESCRIPTION:
[1-3 sentences expanding on why this item or service is specialized, referencing the vendor's unique qualifications (authorized dealer status, proprietary parts access, specialized expertise, etc.). Use formal government contracting language.]

MARKET_RESEARCH:
[2-4 sentences explaining why ${vendorName} is the sole source. Reference: authorized dealer/service status, proprietary access, unique capability, or lack of equivalent alternatives. Include that a market survey was conducted and no other vendor was found capable of meeting the requirement.]`;

  const reply = await callApi<{ reply?: string; error?: string }>("ai-assistant", {
    method: "POST",
    body: { message: prompt, history: [] },
  });

  const text = reply?.reply ?? "";
  const additionalMatch = text.match(/ADDITIONAL_DESCRIPTION:\s*([\s\S]*?)(?=MARKET_RESEARCH:|$)/i);
  const marketMatch     = text.match(/MARKET_RESEARCH:\s*([\s\S]*?)$/i);

  return {
    additional:    additionalMatch?.[1]?.trim() ?? "",
    marketResearch: marketMatch?.[1]?.trim() ?? "",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SoleSourcePage() {
  const { profile } = useAuth();
  const [step, setStep]     = useState(1);
  const [vendors, setVendors] = useState<Vendor889[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor889 | null>(null);
  const [form, setForm]     = useState(emptyForm);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone]     = useState(false);

  // ── Load vendors with a 889 on file ──
  const loadVendors = useCallback(async () => {
    try {
      const rows = await directSelectList<Vendor889>("vendors", {
        columns: "id,name,poc,phone,email,address,address_line2,city_state_zip,section_889_expiration_date",
        filters: ["section_889_expiration_date=not.is.null"],
        orderBy: [{ column: "name", ascending: true }],
        label: "sole-source vendors",
      });
      setVendors(rows ?? []);
    } catch {
      // silently degrade — user can still type manually
    }
  }, []);

  useEffect(() => { loadVendors(); }, [loadVendors]);

  // ── Auto-fill requestor from profile ──
  useEffect(() => {
    if (!profile) return;
    setForm((prev) => ({
      ...prev,
      requestorName: profile.full_name ?? prev.requestorName,
    }));
  }, [profile]);

  // ── Vendor selection ──
  function handleVendorSelect(vendorId: string) {
    const v = vendors.find((vv) => vv.id === vendorId) ?? null;
    setSelectedVendor(v);
    setForm((prev) => ({ ...prev, vendorId }));
  }

  // ── Field update ──
  function set<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── AI generation ──
  async function handleGenerate() {
    if (!form.description) return;
    setGenerating(true);
    try {
      const vendorName = selectedVendor?.name ?? form.vendorId;
      const result = await generateJustification(vendorName, form.description, form.equipmentId);
      setForm((prev) => ({
        ...prev,
        additionalDescription: result.additional,
        marketResearch:        result.marketResearch,
      }));
    } finally {
      setGenerating(false);
    }
  }

  // ── Download ──
  async function handleDownload() {
    setDownloading(true);
    try {
      const v = selectedVendor;
      const data: SoleSourceData = {
        requestingActivity:     form.requestingActivity,
        requiringActivity:      form.requiringActivity,
        requestingInstallation: form.requestingInstallation,
        date:                   form.date,
        estimatedCost:          form.estimatedCost,
        requiredDeliveryDate:   form.requiredDeliveryDate,
        description:            form.description,
        additionalDescription:  form.additionalDescription,
        marketResearch:         form.marketResearch,
        equipmentId:            form.equipmentId,
        hasProprietary:         form.hasProprietary,
        proprietaryData:        form.proprietaryData,
        equipmentOther:         form.equipmentOther,
        contractorName:         v?.name          ?? "",
        contractorAddress:      v?.address       ?? "",
        contractorCityStateZip: buildCityStateZip(v),
        contractorPoc:          v?.poc           ?? "",
        contractorPhone:        v?.phone         ?? "",
        contractorEmail:        v?.email         ?? "",
        manufacturerName:       form.manufacturerName,
        manufacturerPoc:        form.manufacturerPoc,
        manufacturerPhone:      form.manufacturerPhone,
        manufacturerEmail:      form.manufacturerEmail,
        manufacturerAddress:    form.manufacturerAddress,
        manufacturerAddress1:   form.manufacturerAddress1,
        requestorName:          form.requestorName,
      };
      await downloadSoleSourceReport(data);
      setDone(true);
    } finally {
      setDownloading(false);
    }
  }

  function buildCityStateZip(v: Vendor889 | null): string {
    if (!v) return "";
    const parts = [v.address_line2, v.city_state_zip].filter(Boolean);
    return parts.join(", ");
  }

  // ── Step validation ──
  function canAdvance(): boolean {
    if (step === 1) return !!form.vendorId;
    if (step === 2) return !!form.description.trim();
    return true;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (done) {
    return (
      <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
        <div className="p-4 pb-24 max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <CheckCircle className="w-16 h-16 text-green-500" />
          <h2 className="text-xl font-bold">Sole Source Generated</h2>
          <p className="text-sm text-muted-foreground text-center">
            Your sole source justification has been downloaded. Open it in Adobe Acrobat to complete the signature fields before submission.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setDone(false); setStep(1); setForm(emptyForm()); setSelectedVendor(null); }}>
              New Document
            </Button>
            <Button onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              Download Again
            </Button>
          </div>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
      <div className="p-4 pb-24 max-w-xl mx-auto">
        <PageHeader
          title="Sole Source"
          description="Generate a sole source justification form"
          icon={Scale}
        />

        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-0 flex-1">
              <button
                onClick={() => step > s.id && setStep(s.id)}
                className="flex flex-col items-center gap-1 flex-1"
                disabled={step <= s.id}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step === s.id
                    ? "bg-primary text-primary-foreground"
                    : step > s.id
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {step > s.id ? "✓" : s.id}
                </div>
                <span className="text-[10px] text-muted-foreground">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mb-4 transition-colors ${step > s.id ? "bg-green-500" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Contractor ── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="w-4 h-4" /> Select Contractor
              </CardTitle>
              <CardDescription>
                Choose a vendor that has a current Section 889 form on file.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Vendor *</Label>
                <Select value={form.vendorId} onValueChange={handleVendorSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a vendor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.length === 0 && (
                      <SelectItem value="__none" disabled>No vendors with 889 on file</SelectItem>
                    )}
                    {vendors.map((v) => {
                      const expired = is889Expired(v.section_889_expiration_date);
                      return (
                        <SelectItem key={v.id} value={v.id}>
                          <span className={expired ? "text-amber-600" : ""}>{v.name}</span>
                          {expired && " ⚠ 889 expired"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Vendor preview */}
              {selectedVendor && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                  {is889Expired(selectedVendor.section_889_expiration_date) && (
                    <div className="flex items-center gap-1.5 text-amber-600 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-xs">889 expired {format889Date(selectedVendor.section_889_expiration_date)} — verify with FRSC before submitting.</span>
                    </div>
                  )}
                  {selectedVendor.address && <p className="text-muted-foreground">{selectedVendor.address}</p>}
                  {selectedVendor.address_line2 && <p className="text-muted-foreground">{selectedVendor.address_line2}</p>}
                  {selectedVendor.city_state_zip && <p className="text-muted-foreground">{selectedVendor.city_state_zip}</p>}
                  {selectedVendor.poc && <p><span className="font-medium">POC:</span> {selectedVendor.poc}</p>}
                  {selectedVendor.phone && <p><span className="font-medium">Phone:</span> {selectedVendor.phone}</p>}
                  {selectedVendor.email && <p><span className="font-medium">Email:</span> {selectedVendor.email}</p>}
                  {!is889Expired(selectedVendor.section_889_expiration_date) && selectedVendor.section_889_expiration_date && (
                    <Badge variant="outline" className="mt-1 text-green-700 border-green-300 bg-green-50 dark:bg-green-900/20">
                      889 valid through {format889Date(selectedVendor.section_889_expiration_date)}
                    </Badge>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Requesting Activity</Label>
                  <Input value={form.requestingActivity} onChange={(e) => set("requestingActivity", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Requiring Activity</Label>
                  <Input value={form.requiringActivity} onChange={(e) => set("requiringActivity", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Requesting Installation</Label>
                  <Input value={form.requestingInstallation} onChange={(e) => set("requestingInstallation", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input value={form.date} onChange={(e) => set("date", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: Work Details ── */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="w-4 h-4" /> Work Details
              </CardTitle>
              <CardDescription>
                Describe what you need. Use AI to expand your description into professional sole source language.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Estimated Cost</Label>
                  <Input
                    placeholder="e.g. $1,500.00"
                    value={form.estimatedCost}
                    onChange={(e) => set("estimatedCost", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Required Delivery Date</Label>
                  <Input
                    placeholder="e.g. 06/01/2026"
                    value={form.requiredDeliveryDate}
                    onChange={(e) => set("requiredDeliveryDate", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description of Item or Service Required *</Label>
                <Textarea
                  placeholder="Briefly describe what you need (e.g. diagnosis and repair of John Deere 2032R tractor, S/N CS0004289)"
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Equipment / Item ID</Label>
                <Input
                  placeholder="Model, S/N, unit number, etc. (optional)"
                  value={form.equipmentId}
                  onChange={(e) => set("equipmentId", e.target.value)}
                />
              </div>

              {/* AI generate button */}
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={generating || !form.description.trim()}
              >
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Sparkles className="w-4 h-4" /> Generate Justification with AI</>
                }
              </Button>

              <div className="space-y-1.5">
                <Label>Additional Description</Label>
                <Textarea
                  placeholder="Why this item/service requires a sole source contractor…"
                  rows={3}
                  value={form.additionalDescription}
                  onChange={(e) => set("additionalDescription", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Market Research / Sole Source Justification</Label>
                <Textarea
                  placeholder="Results of market survey — why this vendor is uniquely qualified…"
                  rows={4}
                  value={form.marketResearch}
                  onChange={(e) => set("marketResearch", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Does requirement contain proprietary data?</Label>
                  <Select
                    value={form.hasProprietary}
                    onValueChange={(v) => set("hasProprietary", v as "Yes" | "No")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="No">No</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.hasProprietary === "Yes" && (
                  <div className="space-y-1.5">
                    <Label>List proprietary data</Label>
                    <Input
                      value={form.proprietaryData}
                      onChange={(e) => set("proprietaryData", e.target.value)}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 3: Requestor ── */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="w-4 h-4" /> Requestor Information
              </CardTitle>
              <CardDescription>
                Confirm your name. Signature fields are left blank for manual completion in Adobe Acrobat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Requestor Printed Name</Label>
                <Input
                  value={form.requestorName}
                  onChange={(e) => set("requestorName", e.target.value)}
                />
              </div>

              {/* Summary */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-sm">
                <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Summary</p>
                <p><span className="font-medium">Vendor:</span> {selectedVendor?.name ?? "—"}</p>
                <p><span className="font-medium">Estimated Cost:</span> {form.estimatedCost || "—"}</p>
                <p><span className="font-medium">Delivery Date:</span> {form.requiredDeliveryDate || "—"}</p>
                <p><span className="font-medium">Requesting Activity:</span> {form.requestingActivity}</p>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleDownload}
                disabled={downloading || !form.requestorName.trim()}
              >
                {downloading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…</>
                  : <><Download className="w-4 h-4" /> Download Sole Source PDF</>
                }
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-4">
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          {step < STEPS.length && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
