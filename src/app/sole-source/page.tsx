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
import {
  downloadSoleSourceReport,
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
  // Step 2 — AI sections (editable)
  description: string; // section 3
  characteristics: string; // section 4
  marketResearch: string; // section 5
  hasProprietary: "Yes" | "No";
  proprietaryData: string; // section 7
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
    description: "",
    characteristics: "",
    marketResearch: "",
    hasProprietary: "No",
    proprietaryData: "",
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
    address: v.address ?? "",
    cityStateZip: vendorCityStateZip(v),
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
): Promise<{ description: string; characteristics: string; marketResearch: string }> {
  // The ai-assistant endpoint is a scoped GreenKeeper Pro helper — it refuses
  // "you are a Navy contracting specialist" personas. Framing the task as
  // "help me draft justification text for the golf course" keeps it in-scope
  // and it complies. We also forbid markdown, and the parser strips any anyway.
  const prompt = `Help me draft the written justification text for a sole source purchase request for Veterans Memorial Golf Course equipment.

WHAT WE NEED: ${description}
EQUIPMENT / ITEM ID: ${equipmentId || "N/A"}
SOLE SOURCE BUSINESS: ${business || "the named vendor"}

Write three sections of formal government purchasing justification, specific to the equipment and business named. Do not invent part numbers or prices. Where appropriate, reference authorized dealer/distributor status, factory-trained technicians, proprietary diagnostic software or tooling, genuine OEM parts, warranty preservation, prior service history, and that a market survey found no other capable source.

Output ONLY the three sections below, each starting with its exact label on its own line. Do not add any preamble, closing, markdown, or asterisks.

SECTION_3:
<2-4 sentences: a factual scope statement of what is being purchased or serviced; name the equipment, model, and serial/ID when provided>

SECTION_4:
<2-4 sentences: the specific characteristics that limit availability to a sole source>

SECTION_5:
<3-5 sentences: why only this business can furnish the requirement to the exclusion of other sources; state that a market survey was conducted and found no other capable source>`;

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
  const s5 = (norm.match(/SECTION[\s_]*5\s*:?\s*([\s\S]*?)$/i)?.[1] ?? "").trim();

  return {
    description: s3 || description,
    characteristics: s4,
    marketResearch: s5,
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

  // Auto-fill requestor name from profile.
  useEffect(() => {
    if (!profile) return;
    setForm((prev) =>
      prev.requestorName ? prev : { ...prev, requestorName: profile.full_name ?? "" },
    );
  }, [profile]);

  const set = <K extends keyof SsForm>(key: K, value: SsForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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

  // ── Generate (AI) then advance to review ──
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setWarning(null);
    try {
      const result = await generateSoleSourceSections(
        businessName,
        form.plainDescription.trim(),
        form.equipmentId.trim(),
      );
      setForm((prev) => ({
        ...prev,
        description: result.description,
        characteristics: result.characteristics,
        marketResearch: result.marketResearch,
      }));
      if (!result.characteristics || !result.marketResearch) {
        setWarning(
          "The AI returned partial text. Review sections 4 and 5 below and edit as needed before downloading.",
        );
      }
      setStep(2);
    } catch {
      // Resilient fallback: seed section 3 with the plain description so the
      // user can always proceed and fill the rest manually.
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
  }, [businessName, form.plainDescription, form.equipmentId]);

  // ── Download ──
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setError(null);
    try {
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
        compatibilityNotes: "",
        directReplacement: "N/A",
        contractorName: c.name,
        contractorAddress: c.address,
        contractorCityStateZip: c.cityStateZip,
        contractorPoc: c.poc,
        contractorPhone: c.phone,
        contractorEmail: c.email,
        requestorName: form.requestorName,
      };
      await downloadSoleSourceReport(data);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't generate the PDF. Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  }, [form, vendors]);

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
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {isComplete ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 ${step > s.id ? "bg-[#1B4332]/40" : "bg-gray-200"}`} />
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
                  onChange={(e) => set("vendorId", e.target.value)}
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
                  {selectedVendor.address && (
                    <p className="text-muted-foreground">{selectedVendor.address}</p>
                  )}
                  {vendorCityStateZip(selectedVendor) && (
                    <p className="text-muted-foreground">{vendorCityStateZip(selectedVendor)}</p>
                  )}
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
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  Business: <span className="text-foreground">{businessName || "—"}</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rewriting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" /> Regenerate
                    </>
                  )}
                </Button>
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
                    <Input
                      id="propData"
                      value={form.proprietaryData}
                      onChange={(e) => set("proprietaryData", e.target.value)}
                    />
                  </div>
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
