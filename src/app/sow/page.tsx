"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  ChevronRight,
  ChevronLeft,
  Download,
  Loader2,
  CheckCircle,
  Sparkles,
  ClipboardList,
  CalendarDays,
  MapPin,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoleGuard, MANAGEMENT_ROLES } from "@/components/auth/role-guard";
import { useAuth } from "@/lib/hooks/useAuth";
import { roleLabels } from "@/lib/hooks/useProfiles";
import { callApi } from "@/lib/api/client";
import { useAiGenerate, type AiSource, type AiResult } from "@/lib/ai/use-ai-generate";
import { AiSourceBadge } from "@/components/ai/ai-source-badge";
import { generateSowReport, type SowFormData } from "@/lib/reports/sow-report";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import { saveCreatedDocument } from "@/lib/documents/saved-documents";
import { PR_DELIVERY_DEFAULTS, PR_REQUESTOR_DEFAULTS } from "@/lib/pr-defaults";
import { todayLocal, todayCentralMmDdYyyy } from "@/lib/utils/date";

// ── Constants ─────────────────────────────────────────────────────────────────

const COURSE_NAME = "Veterans Memorial Golf Course";
const BUILDING = "Golf Course Maintenance Facility, BLDG 8400";
const FACILITY_ADDRESS = "2821 Great Lakes Dr, Great Lakes, IL 60088";

// ── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Work Details", icon: ClipboardList },
  { id: 2, label: "Schedule", icon: CalendarDays },
  { id: 3, label: "Location", icon: MapPin },
  { id: 4, label: "Your Info", icon: User },
];

// ── Form type ─────────────────────────────────────────────────────────────────

type SowForm = Omit<SowFormData, "expectationText" | "descriptionOfGoods"> & {
  workDescription: string;
};

function emptyForm(): SowForm {
  return {
    date: todayCentralMmDdYyyy(),
    from: "",
    activityName: COURSE_NAME,
    requisitionType: "",
    requisitionReason: "",
    hasReferences: false,
    referencesText: "",
    projectedStartDate: "",
    desiredCompletionDate: "",
    facilityHours: "Open daily, including Sundays and holidays: 0700–2000",
    appointmentTime: "",
    servicesInterrupted: false,
    patronsInDanger: false,
    personnelCertifications: "",
    specificPersonnelRequired: false,
    personnelCount: "",
    lodgingRequired: false,
    individualLodging: false,
    groupLodging: false,
    vehicleStorage: false,
    equipmentStorage: false,
    baseAccess: false,
    escort: true,
    weatherInterrupt: false,
    rescheduleIfWeather: false,
    rescheduleDate: "",
    baseEntryAmendments: false,
    buildingNameNumber: BUILDING,
    roomNumber: "",
    accessDirections: `Contractor shall proceed to the Veterans Memorial Golf Course at ${FACILITY_ADDRESS}. Upon arrival, contractor shall contact ${PR_DELIVERY_DEFAULTS.poc} or the Course Superintendent for escort to the work area. No base access, gate entry, or government-issued ID is required — the facility is accessible directly from the public road.`,
    requestorName: "",
    requestorTitle: "",
    directPhone: PR_REQUESTOR_DEFAULTS.phone,
    cellPhone: "",
    email: "",
    supervisorName: PR_DELIVERY_DEFAULTS.poc,
    supervisorPhone: PR_DELIVERY_DEFAULTS.phone,
    workDescription: "",
  };
}

// ── AI generation ─────────────────────────────────────────────────────────────

async function generateSowContent(
  workDescription: string,
  activityName: string,
  from: string,
  startDate: string,
  endDate: string,
  location: string,
  requisitionType: string,
  requisitionReason: string,
): Promise<{ expectation: string; goods: string; certifications: string }> {
  const prompt = `You are a professional Navy FRSC contracting specialist writing a Statement of Work.

Based on the following details, generate professional government contracting language.

ACTIVITY: ${activityName || "VMGC Golf Course"}
REQUESTED BY: ${from}
WORK DESCRIPTION: ${workDescription}
PERIOD OF PERFORMANCE: ${startDate} through ${endDate}
LOCATION: ${location}
REQUISITION TYPE: ${requisitionType}
REASON: ${requisitionReason}

Keep it concise — no filler or repetition. Provide three sections formatted EXACTLY as shown:

EXPECTATION:
[Write 4-6 numbered items covering only the essential contractor duties. Use formal government contracting language. Across those items cover mobilization/site preparation, the specific work task(s), safety/compliance, cleanup/disposal, documentation, and coordination with the COR. Combine related duties rather than padding the list, and be specific but brief.]

DESCRIPTION_OF_GOODS:
[Write 2-3 professional sentences describing the goods/services being procured for this contract.]

CERTIFICATIONS:
[Write 1-2 sentences listing minimum contractor certifications, licenses, or skills required for this type of work. Be specific to the trade.]`;

  const reply = await callApi<{ reply?: string; error?: string }>("ai-assistant", {
    method: "POST",
    body: { message: prompt, history: [] },
  });

  const text = reply?.reply ?? "";

  // Parse sections
  const expectMatch = text.match(/EXPECTATION:\s*([\s\S]*?)(?=DESCRIPTION_OF_GOODS:|$)/i);
  const goodsMatch = text.match(/DESCRIPTION_OF_GOODS:\s*([\s\S]*?)(?=CERTIFICATIONS:|$)/i);
  const certMatch = text.match(/CERTIFICATIONS:\s*([\s\S]*?)$/i);

  return {
    expectation: expectMatch?.[1]?.trim() ?? workDescription,
    goods: goodsMatch?.[1]?.trim() ?? `${requisitionType} for ${activityName}: ${workDescription}`,
    certifications: certMatch?.[1]?.trim() ?? "Contractor shall possess all applicable federal, state, and local licenses and certifications required for this type of work.",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SowPage() {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<SowForm>(emptyForm);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-populate requestor fields from the logged-in user's profile.
  // Supervisor (Joseph Caprez) and location are hardcoded from pr-defaults.
  useEffect(() => {
    if (!profile) return;
    const title = roleLabels[profile.role] ?? "";
    setForm((prev) => ({
      ...prev,
      requestorName: profile.full_name ?? prev.requestorName,
      requestorTitle: title || prev.requestorTitle,
      directPhone: profile.phone ?? PR_REQUESTOR_DEFAULTS.phone,
      email: profile.email ?? prev.email,
      from: `${profile.full_name}, ${title}, ${COURSE_NAME}`,
    }));
  }, [profile]);

  const set = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canNext = (): boolean => {
    if (step === 1) return !!form.workDescription.trim() && !!form.requisitionType && !!form.from.trim() && !!form.activityName.trim();
    if (step === 2) return !!form.projectedStartDate && !!form.desiredCompletionDate;
    if (step === 3) return !!form.buildingNameNumber.trim();
    if (step === 4) return !!form.requestorName.trim() && !!form.directPhone.trim() && !!form.email.trim();
    return true;
  };

  // ── AI learning library — reuse a past SOW for the same work (free) before
  // paying; the user can force a fresh paid version from the done state. ──
  const ai = useAiGenerate("sow");
  const [aiSource, setAiSource] = useState<AiSource | null>(null);
  const msStr = (v: unknown): string => (typeof v === "string" ? v : "");

  const sowCompose = () =>
    [form.requisitionType, form.workDescription.trim()].filter(Boolean).join(" | ");

  const sowCallAi = async () => {
    const r = await generateSowContent(
      form.workDescription,
      form.activityName,
      form.from,
      form.projectedStartDate,
      form.desiredCompletionDate,
      `${form.buildingNameNumber}${form.roomNumber ? `, Room ${form.roomNumber}` : ""}`,
      form.requisitionType,
      form.requisitionReason || "New requirement",
    );
    return {
      text: `EXPECTATION:\n${r.expectation}\n\nDESCRIPTION_OF_GOODS:\n${r.goods}\n\nCERTIFICATIONS:\n${r.certifications}`,
      meta: { expectation: r.expectation, goods: r.goods, certifications: r.certifications },
      model: "claude-sonnet-4-6",
    };
  };

  const sowSectionsFrom = (res: AiResult) => ({
    expectation: msStr(res.meta.expectation) || form.workDescription,
    goods:
      msStr(res.meta.goods) ||
      `${form.requisitionType} for ${form.activityName}: ${form.workDescription}`,
    certifications:
      msStr(res.meta.certifications) ||
      "Contractor shall possess all applicable federal, state, and local licenses and certifications required for this type of work.",
  });

  const buildSowData = (sections: {
    expectation: string;
    goods: string;
    certifications: string;
  }): SowFormData => ({
    date: form.date,
    from: form.from,
    activityName: form.activityName,
    requisitionType: form.requisitionType,
    requisitionReason: form.requisitionReason,
    hasReferences: form.hasReferences,
    referencesText: form.referencesText,
    projectedStartDate: form.projectedStartDate,
    desiredCompletionDate: form.desiredCompletionDate,
    facilityHours: form.facilityHours,
    appointmentTime: form.appointmentTime,
    servicesInterrupted: form.servicesInterrupted,
    patronsInDanger: form.patronsInDanger,
    personnelCertifications: sections.certifications,
    specificPersonnelRequired: form.specificPersonnelRequired,
    personnelCount: form.personnelCount,
    lodgingRequired: form.lodgingRequired,
    individualLodging: form.individualLodging,
    groupLodging: form.groupLodging,
    vehicleStorage: form.vehicleStorage,
    equipmentStorage: form.equipmentStorage,
    baseAccess: form.baseAccess,
    escort: form.escort,
    expectationText: sections.expectation,
    weatherInterrupt: form.weatherInterrupt,
    rescheduleIfWeather: form.rescheduleIfWeather,
    rescheduleDate: form.rescheduleDate,
    baseEntryAmendments: form.baseEntryAmendments,
    buildingNameNumber: form.buildingNameNumber,
    roomNumber: form.roomNumber,
    accessDirections: form.accessDirections || "N/A",
    descriptionOfGoods: sections.goods,
    requestorName: form.requestorName,
    requestorTitle: form.requestorTitle,
    directPhone: form.directPhone,
    cellPhone: form.cellPhone,
    email: form.email,
    supervisorName: form.supervisorName,
    supervisorPhone: form.supervisorPhone,
  });

  const generateAndDownload = async (res: AiResult) => {
    setAiSource(res.source);
    setDownloading(true);
    const sowData = buildSowData(sowSectionsFrom(res));
    const { blob, filename } = await generateSowReport(sowData);
    await saveBlobToDevice({ blob, filename, shareTitle: "Statement of Work" });
    // Save a copy to the Documents library so it can be retrieved later.
    await saveCreatedDocument({
      docType: "sow",
      title: `SOW — ${form.activityName || form.from || "VMGC"}`,
      blob,
      filename,
      meta: { activity: form.activityName, requisitionType: form.requisitionType },
    });
    setDone(true);
  };

  // Library-first: reuse a past SOW for the same work (free) before paying.
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await generateAndDownload(
        await ai.run({
          input: sowCompose(),
          inputMeta: { requisitionType: form.requisitionType, activity: form.activityName },
          callAi: sowCallAi,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate SOW. Please try again.");
    } finally {
      setGenerating(false);
      setDownloading(false);
    }
  };

  // Paid regenerate ("I don't like it") — used from the done state.
  const handleRegenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await generateAndDownload(
        await ai.regenerate({
          input: sowCompose(),
          inputMeta: { requisitionType: form.requisitionType, activity: form.activityName },
          callAi: sowCallAi,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate SOW. Please try again.");
    } finally {
      setGenerating(false);
      setDownloading(false);
    }
  };

  const handleReset = () => {
    setForm(emptyForm());
    setStep(1);
    setDone(false);
    setError(null);
  };

  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
      <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
        <PageHeader
          title="Statement of Work"
          description="Generate a professional Navy FRSC SOW request"
          icon={FileText}
        />

        {/* Step indicator */}
        {!done && (
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
                    {isComplete ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 ${step > s.id ? "bg-[#1B4332]/40" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── DONE state ── */}
        {done && (
          <Card className="mt-6 border-green-200 bg-green-50">
            <CardContent className="p-8 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-green-800">SOW Generated</h2>
                <p className="text-sm text-green-700 mt-1">
                  Your Statement of Work PDF has been downloaded. Review it and submit to FRSC Contracting.
                </p>
              </div>
              <div className="flex justify-center">
                <AiSourceBadge source={aiSource} />
              </div>
              <div className="flex flex-wrap gap-3 justify-center pt-2">
                <Button onClick={handleGenerate} variant="outline" disabled={generating || downloading}>
                  {downloading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Downloading...</>
                  ) : (
                    <><Download className="w-4 h-4 mr-2" />Download Again</>
                  )}
                </Button>
                <Button onClick={handleRegenerate} variant="outline" disabled={generating || downloading}>
                  {generating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Rewriting…</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" />Regenerate with AI</>
                  )}
                </Button>
                <Button onClick={handleReset} className="bg-[#1B4332] hover:bg-[#2D6A4F]">
                  New SOW
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 1: Work Details ── */}
        {!done && step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Work Details</CardTitle>
              <CardDescription>Describe what the contractor needs to do</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="workDescription">
                  What work needs to be done? <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="workDescription"
                  placeholder="Describe what the contractor will do. The AI tailors every section to the trade — paving, roofing, HVAC, electrical, tree care, irrigation, painting, fencing, pest control, etc. Be specific about quantities, locations, and materials."
                  value={form.workDescription}
                  onChange={(e) => set("workDescription", e.target.value)}
                  rows={5}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">Be as specific as possible — the AI will expand this into professional contract language.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="from">
                    From (Your Name/Office) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="from"
                    placeholder="e.g. Golf Course Superintendent, VMGC"
                    value={form.from}
                    onChange={(e) => set("from", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activityName">
                    Activity Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="activityName"
                    placeholder="e.g. VMGC Golf Course"
                    value={form.activityName}
                    onChange={(e) => set("activityName", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="requisitionType">
                    Requisition Type <span className="text-red-500">*</span>
                  </Label>
                  <Select value={form.requisitionType} onValueChange={(v) => set("requisitionType", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New Procurement">New Procurement</SelectItem>
                      <SelectItem value="Re-order">Re-order</SelectItem>
                      <SelectItem value="Renewal">Renewal</SelectItem>
                      <SelectItem value="Non-Personal Services Contract">Non-Personal Services Contract</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="requisitionReason">Reason for Requisition</Label>
                  <Select value={form.requisitionReason} onValueChange={(v) => set("requisitionReason", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New Requirement">New Requirement</SelectItem>
                      <SelectItem value="Replacement">Replacement</SelectItem>
                      <SelectItem value="Additional Quantity">Additional Quantity</SelectItem>
                      <SelectItem value="Enhancement/Upgrade">Enhancement/Upgrade</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: Schedule ── */}
        {!done && step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schedule & Operations</CardTitle>
              <CardDescription>When and how the work will be performed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="startDate">
                    Projected Start Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={form.projectedStartDate}
                    onChange={(e) => set("projectedStartDate", e.target.value)}
                    min={todayLocal()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="endDate">
                    Desired Completion Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={form.desiredCompletionDate}
                    onChange={(e) => set("desiredCompletionDate", e.target.value)}
                    min={form.projectedStartDate || todayLocal()}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="facilityHours">Facility Hours of Operation</Label>
                <Input
                  id="facilityHours"
                  placeholder="e.g. Monday–Friday, 0600–1800; Saturday–Sunday, 0600–1600"
                  value={form.facilityHours}
                  onChange={(e) => set("facilityHours", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appointmentTime">Preferred Service Time</Label>
                <Input
                  id="appointmentTime"
                  placeholder="e.g. Early morning before 0700 to avoid golfer traffic"
                  value={form.appointmentTime}
                  onChange={(e) => set("appointmentTime", e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Will services interrupt normal operations?</p>
                    <p className="text-xs text-muted-foreground">e.g. closing holes, blocking cart paths</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={form.servicesInterrupted ? "default" : "outline"}
                      className={form.servicesInterrupted ? "bg-[#1B4332] hover:bg-[#2D6A4F]" : ""}
                      onClick={() => set("servicesInterrupted", true)}
                    >Yes</Button>
                    <Button
                      size="sm"
                      variant={!form.servicesInterrupted ? "default" : "outline"}
                      className={!form.servicesInterrupted ? "bg-[#1B4332] hover:bg-[#2D6A4F]" : ""}
                      onClick={() => set("servicesInterrupted", false)}
                    >No</Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Could weather interrupt this work?</p>
                    <p className="text-xs text-muted-foreground">outdoor or weather-sensitive work</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={form.weatherInterrupt ? "default" : "outline"}
                      className={form.weatherInterrupt ? "bg-[#1B4332] hover:bg-[#2D6A4F]" : ""}
                      onClick={() => set("weatherInterrupt", true)}
                    >Yes</Button>
                    <Button
                      size="sm"
                      variant={!form.weatherInterrupt ? "default" : "outline"}
                      className={!form.weatherInterrupt ? "bg-[#1B4332] hover:bg-[#2D6A4F]" : ""}
                      onClick={() => set("weatherInterrupt", false)}
                    >No</Button>
                  </div>
                </div>
              </div>

              {form.weatherInterrupt && (
                <div className="space-y-1.5">
                  <Label htmlFor="rescheduleDate">Proposed Reschedule Date(s)</Label>
                  <Input
                    id="rescheduleDate"
                    placeholder="e.g. Next available weekday, or within 7 days of original date"
                    value={form.rescheduleDate}
                    onChange={(e) => set("rescheduleDate", e.target.value)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── STEP 3: Location & Personnel ── */}
        {!done && step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Location & Access</CardTitle>
              <CardDescription>Where the work will take place</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="building">
                    Building Name &amp; Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="building"
                    placeholder="e.g. VMGC Maintenance Bldg 1492"
                    value={form.buildingNameNumber}
                    onChange={(e) => set("buildingNameNumber", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="room">Room Number</Label>
                  <Input
                    id="room"
                    placeholder="e.g. N/A or Room 101"
                    value={form.roomNumber}
                    onChange={(e) => set("roomNumber", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="access">Site Access &amp; Contact Instructions</Label>
                <Textarea
                  id="access"
                  placeholder="e.g. Contractor should report to the Golf Course Superintendent upon arrival. Access via Gate 5 on Smith Road. Escort required to maintenance yard. If no specific instructions, write N/A."
                  value={form.accessDirections}
                  onChange={(e) => set("accessDirections", e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Does contractor need base access documents?</p>
                    <p className="text-xs text-muted-foreground">amendments to entry paperwork</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={form.baseEntryAmendments ? "default" : "outline"}
                      className={form.baseEntryAmendments ? "bg-[#1B4332] hover:bg-[#2D6A4F]" : ""}
                      onClick={() => set("baseEntryAmendments", true)}
                    >Yes</Button>
                    <Button
                      size="sm"
                      variant={!form.baseEntryAmendments ? "default" : "outline"}
                      className={!form.baseEntryAmendments ? "bg-[#1B4332] hover:bg-[#2D6A4F]" : ""}
                      onClick={() => set("baseEntryAmendments", false)}
                    >No</Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Will contractor need an escort on base?</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={form.escort ? "default" : "outline"}
                      className={form.escort ? "bg-[#1B4332] hover:bg-[#2D6A4F]" : ""}
                      onClick={() => { set("escort", true); set("baseAccess", true); }}
                    >Yes</Button>
                    <Button
                      size="sm"
                      variant={!form.escort ? "default" : "outline"}
                      className={!form.escort ? "bg-[#1B4332] hover:bg-[#2D6A4F]" : ""}
                      onClick={() => set("escort", false)}
                    >No</Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Will contractor need lodging?</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={form.lodgingRequired ? "default" : "outline"}
                      className={form.lodgingRequired ? "bg-[#1B4332] hover:bg-[#2D6A4F]" : ""}
                      onClick={() => set("lodgingRequired", true)}
                    >Yes</Button>
                    <Button
                      size="sm"
                      variant={!form.lodgingRequired ? "default" : "outline"}
                      className={!form.lodgingRequired ? "bg-[#1B4332] hover:bg-[#2D6A4F]" : ""}
                      onClick={() => set("lodgingRequired", false)}
                    >No</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 4: Requestor Info ── */}
        {!done && step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Requestor Information</CardTitle>
              <CardDescription>Your contact information for Section 7</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reqName">
                    Your Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="reqName"
                    placeholder="First Last"
                    value={form.requestorName}
                    onChange={(e) => set("requestorName", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reqTitle">Position / Title</Label>
                  <Input
                    id="reqTitle"
                    placeholder="e.g. Golf Course Superintendent"
                    value={form.requestorTitle}
                    onChange={(e) => set("requestorTitle", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="directPhone">
                    Direct Phone <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="directPhone"
                    type="tel"
                    placeholder="(000) 000-0000"
                    value={form.directPhone}
                    onChange={(e) => set("directPhone", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cellPhone">Cell Phone</Label>
                  <Input
                    id="cellPhone"
                    type="tel"
                    placeholder="(000) 000-0000"
                    value={form.cellPhone}
                    onChange={(e) => set("cellPhone", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@navy.mil"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="supName">Supervisor Name</Label>
                  <Input
                    id="supName"
                    placeholder="First Last"
                    value={form.supervisorName}
                    onChange={(e) => set("supervisorName", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="supPhone">Supervisor Phone</Label>
                  <Input
                    id="supPhone"
                    type="tel"
                    placeholder="(000) 000-0000"
                    value={form.supervisorPhone}
                    onChange={(e) => set("supervisorPhone", e.target.value)}
                  />
                </div>
              </div>

              {/* Summary banner */}
              <div className="mt-4 p-4 bg-[#1B4332]/5 border border-[#1B4332]/20 rounded-lg space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-[#1B4332]">
                  <Sparkles className="w-4 h-4" />
                  Ready to Generate
                </div>
                <p className="text-xs text-muted-foreground">
                  Claude AI will professionally expand your work description into complete SOW contract language, then generate a 5-page PDF matching the official FRSC template.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Navigation buttons */}
        {!done && (
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            {step < 4 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext()}
                className="bg-[#1B4332] hover:bg-[#2D6A4F]"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={!canNext() || generating}
                className="bg-[#1B4332] hover:bg-[#2D6A4F]"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {downloading ? "Building PDF…" : "Generating SOW…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate SOW
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
