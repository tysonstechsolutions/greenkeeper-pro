"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  User,
  Save,
  Loader2,
  Phone,
  Mail,
  Calendar,
  Shield,
  Users,
  Upload,
  FileText,
  Trash2,
  Plus,
  Sparkles,
  Award,
  ExternalLink,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { callApi } from "@/lib/api/client";
import { useProfiles, roleLabels, getInitials } from "@/lib/hooks/useProfiles";
import { useEmployee } from "@/lib/staff/use-employee";
import {
  RECORD_TYPE_LABELS,
  RECORD_TYPE_COLORS,
  RECORD_TYPES_WITH_HOURS,
  RECORD_TYPES_WITH_AMOUNT,
  DOC_CATEGORY_LABELS,
  DOC_CATEGORY_ORDER,
  type StaffRecordType,
} from "@/lib/staff/types";
import type { UserRole, Certification as Cert, PersonnelDetails } from "@/types/database";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "super", label: "Superintendent" },
  { value: "asst_super", label: "Asst. Superintendent" },
  { value: "foreman", label: "Foreman" },
  { value: "mechanic", label: "Mechanic" },
  { value: "crew", label: "Crew" },
  { value: "seasonal", label: "Seasonal" },
  { value: "pro", label: "Pro Shop" },
  { value: "director", label: "Director" },
  { value: "gm", label: "General Manager" },
];

const RECORD_TYPE_OPTIONS: StaffRecordType[] = [
  "note",
  "call_out",
  "sick_time",
  "holiday_pay",
  "disciplinary",
  "one_on_one",
];

type Tab = "info" | "documents" | "records" | "oneonone";

interface AutofillResult {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hire_date?: string | null;
  emergency_contact?: { name?: string | null; phone?: string | null; relationship?: string | null } | null;
  warnings?: string[];
}

function fileToBase64(file: File): Promise<{ b64: string; type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve({ b64: s.split(",")[1] || "", type: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d.length <= 10 ? d + "T12:00:00" : d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
}

/** Drop blank fields; return null if nothing was entered. */
function cleanPd(pd: PersonnelDetails): PersonnelDetails | null {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(pd)) {
    const t = (v ?? "").toString().trim();
    if (t) out[k] = t;
  }
  return Object.keys(out).length ? (out as PersonnelDetails) : null;
}

function ProfileContent() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? "";

  const {
    profile,
    supervisor,
    reports,
    records,
    documents,
    loading,
    error,
    saveProfile,
    addRecord,
    deleteRecord,
    addDocument,
    deleteDocument,
  } = useEmployee(id);
  const { profiles } = useProfiles();

  const [tab, setTab] = useState<Tab>("info");

  // ── Info form ──
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("crew");
  const [hireDate, setHireDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [supervisorId, setSupervisorId] = useState("");
  const [ecName, setEcName] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecRel, setEcRel] = useState("");
  const [certs, setCerts] = useState<Cert[]>([]);
  const [pd, setPd] = useState<PersonnelDetails>({});
  const setPdField = (k: keyof PersonnelDetails, v: string) =>
    setPd((p) => ({ ...p, [k]: v }));
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // sync form when the profile loads/changes
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name || "");
    setDisplayName(profile.display_name || "");
    setEmail(profile.email || "");
    setPhone(profile.phone || "");
    setRole(profile.role);
    setHireDate(profile.hire_date || "");
    setIsActive(profile.is_active);
    setSupervisorId(profile.supervisor_id || "");
    setEcName(profile.emergency_contact?.name || "");
    setEcPhone(profile.emergency_contact?.phone || "");
    setEcRel(profile.emergency_contact?.relationship || "");
    setCerts(Array.isArray(profile.certifications) ? profile.certifications : []);
    setPd(profile.personnel_details || {});
  }, [profile]);

  const supervisorOptions = useMemo(
    () => profiles.filter((p) => p.id !== id),
    [profiles, id],
  );

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    setInfoMsg(null);
    try {
      const emergency =
        ecName.trim() || ecPhone.trim() || ecRel.trim()
          ? { name: ecName.trim(), phone: ecPhone.trim(), relationship: ecRel.trim() }
          : null;
      await saveProfile({
        full_name: fullName.trim(),
        display_name: displayName.trim() || null,
        email: email.trim(),
        phone: phone.trim() || null,
        role,
        hire_date: hireDate || null,
        is_active: isActive,
        supervisor_id: supervisorId || null,
        emergency_contact: emergency,
        certifications: certs,
        personnel_details: cleanPd(pd),
      });
      setInfoMsg("Saved.");
      setTimeout(() => setInfoMsg(null), 2500);
    } catch (e) {
      setInfoMsg(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSavingInfo(false);
    }
  };

  // ── Auto-fill from a document ──
  const autofillRef = useRef<HTMLInputElement>(null);
  const [autofillBusy, setAutofillBusy] = useState(false);
  const [autofillError, setAutofillError] = useState<string | null>(null);
  const [autofill, setAutofill] = useState<AutofillResult | null>(null);

  const handleAutofillFile = async (file: File | undefined) => {
    if (!file) return;
    setAutofillBusy(true);
    setAutofillError(null);
    setAutofill(null);
    try {
      const { b64, type } = await fileToBase64(file);
      const res = await callApi<AutofillResult>("extract-staff-doc", {
        method: "POST",
        body: { image_base64: b64, media_type: type },
      });
      setAutofill(res);
    } catch {
      setAutofillError(
        "Couldn't read the document automatically. You can still type the info into the Info tab.",
      );
    } finally {
      setAutofillBusy(false);
      if (autofillRef.current) autofillRef.current.value = "";
    }
  };

  const applyAutofill = () => {
    if (!autofill) return;
    if (autofill.full_name) setFullName(autofill.full_name);
    if (autofill.phone) setPhone(autofill.phone);
    if (autofill.email) setEmail(autofill.email);
    if (autofill.hire_date) setHireDate(autofill.hire_date);
    if (autofill.emergency_contact) {
      if (autofill.emergency_contact.name) setEcName(autofill.emergency_contact.name);
      if (autofill.emergency_contact.phone) setEcPhone(autofill.emergency_contact.phone);
      if (autofill.emergency_contact.relationship) setEcRel(autofill.emergency_contact.relationship);
    }
    setAutofill(null);
    setTab("info");
    setInfoMsg("Imported — review the fields and Save.");
  };

  // ── Document upload ──
  const docRef = useRef<HTMLInputElement>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [docCategory, setDocCategory] = useState("other");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const handleUploadDoc = async () => {
    if (!docFile) return;
    setUploadingDoc(true);
    setDocError(null);
    try {
      await addDocument(docFile, docName, docCategory);
      setDocFile(null);
      setDocName("");
      setDocCategory("other");
      if (docRef.current) docRef.current.value = "";
    } catch (e) {
      setDocError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadingDoc(false);
    }
  };

  // ── Add record ──
  const [recType, setRecType] = useState<StaffRecordType>("note");
  const [recDate, setRecDate] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recDetails, setRecDetails] = useState("");
  const [recHours, setRecHours] = useState("");
  const [recAmount, setRecAmount] = useState("");
  const [recFollowUp, setRecFollowUp] = useState("");
  const [addingRec, setAddingRec] = useState(false);

  const resetRecForm = () => {
    setRecTitle("");
    setRecDetails("");
    setRecHours("");
    setRecAmount("");
    setRecFollowUp("");
    setRecDate("");
  };

  const handleAddRecord = async () => {
    setAddingRec(true);
    try {
      await addRecord({
        type: recType,
        event_date: recDate || new Date().toISOString().slice(0, 10),
        title: recTitle.trim() || null,
        details: recDetails.trim() || null,
        hours: RECORD_TYPES_WITH_HOURS.includes(recType) && recHours ? Number(recHours) : null,
        amount: RECORD_TYPES_WITH_AMOUNT.includes(recType) && recAmount ? Number(recAmount) : null,
        follow_up: recType === "one_on_one" && recFollowUp.trim() ? recFollowUp.trim() : null,
      });
      resetRecForm();
    } finally {
      setAddingRec(false);
    }
  };

  // ── Log a 1:1 ──
  const [ooDate, setOoDate] = useState("");
  const [ooDetails, setOoDetails] = useState("");
  const [ooFollowUp, setOoFollowUp] = useState("");
  const [addingOo, setAddingOo] = useState(false);

  const handleAddOneOnOne = async () => {
    if (!ooDetails.trim()) return;
    setAddingOo(true);
    try {
      await addRecord({
        type: "one_on_one",
        event_date: ooDate || new Date().toISOString().slice(0, 10),
        title: "1:1 Check-In",
        details: ooDetails.trim(),
        follow_up: ooFollowUp.trim() || null,
      });
      setOoDate("");
      setOoDetails("");
      setOoFollowUp("");
    } finally {
      setAddingOo(false);
    }
  };

  const oneOnOnes = useMemo(() => records.filter((r) => r.type === "one_on_one"), [records]);

  if (!id) {
    return (
      <div className="p-6 text-sm text-muted-foreground">No employee selected.</div>
    );
  }

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4 gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: "Info" },
    { key: "documents", label: "Documents" },
    { key: "records", label: "Records" },
    { key: "oneonone", label: "1:1s" },
  ];

  return (
    <div className="p-4 md:p-6 pb-24 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-11 h-11 rounded-full bg-[#1B4332]/10 text-[#1B4332] flex items-center justify-center font-semibold">
          {getInitials(profile?.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">{profile?.full_name || "Employee"}</h1>
          <p className="text-sm text-muted-foreground">
            {roleLabels[role]} {supervisor ? `· reports to ${supervisor.full_name}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => router.push(`/staff/sf52?employee=${id}`)}
        >
          <FileText className="w-4 h-4" /> SF-52
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key
                ? "border-[#1B4332] text-[#1B4332]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.key === "documents" && documents.length > 0 ? ` (${documents.length})` : ""}
            {t.key === "records" && records.length > 0 ? ` (${records.length})` : ""}
          </button>
        ))}
      </div>

      {/* ── INFO ── */}
      {tab === "info" && (
        <div className="space-y-5 max-w-xl">
          {infoMsg && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
              {infoMsg}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role" className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Role</Label>
              <select id="role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base">
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hireDate" className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Hire date</Label>
              <Input id="hireDate" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="supervisor" className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Reports to (supervisor)</Label>
              <select id="supervisor" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base">
                <option value="">— None —</option>
                {supervisorOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name} ({roleLabels[p.role]})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Emergency contact */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <p className="text-sm font-medium">Emergency contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label htmlFor="ecName">Name</Label><Input id="ecName" value={ecName} onChange={(e) => setEcName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="ecPhone">Phone</Label><Input id="ecPhone" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="ecRel">Relationship</Label><Input id="ecRel" value={ecRel} onChange={(e) => setEcRel(e.target.value)} /></div>
            </div>
          </div>

          {/* Certifications */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-1.5"><Award className="w-4 h-4" /> Certifications</p>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setCerts((c) => [...c, { name: "", issued_date: "", expiry_date: null, license_number: null }])}>
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
            {certs.length === 0 && <p className="text-xs text-muted-foreground">None recorded.</p>}
            {certs.map((c, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
                <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={c.name} onChange={(e) => setCerts((arr) => arr.map((x, ix) => ix === i ? { ...x, name: e.target.value } : x))} placeholder="e.g. IL Pesticide Applicator" /></div>
                <div className="space-y-1"><Label className="text-xs">Expires</Label><Input type="date" value={c.expiry_date || ""} onChange={(e) => setCerts((arr) => arr.map((x, ix) => ix === i ? { ...x, expiry_date: e.target.value || null } : x))} /></div>
                <Button type="button" variant="outline" size="icon" className="text-red-600" onClick={() => setCerts((arr) => arr.filter((_, ix) => ix !== i))}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>

          {/* Personnel / SF-52 details */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <p className="text-sm font-medium flex items-center gap-1.5"><FileText className="w-4 h-4" /> Personnel details (for SF-52)</p>
            <p className="text-xs text-muted-foreground">Auto-fills the SF-52 personnel-action form. No SSN or date of birth is stored.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Last name</Label><Input value={pd.name_last || ""} onChange={(e) => setPdField("name_last", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">First name</Label><Input value={pd.name_first || ""} onChange={(e) => setPdField("name_first", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Middle</Label><Input value={pd.name_middle || ""} onChange={(e) => setPdField("name_middle", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Position title</Label><Input value={pd.position_title || ""} onChange={(e) => setPdField("position_title", e.target.value)} placeholder="e.g. Recreation Aide" /></div>
              <div className="space-y-1"><Label className="text-xs">Position number (PD#)</Label><Input value={pd.position_number || ""} onChange={(e) => setPdField("position_number", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Pay plan</Label>
                <select value={pd.pay_plan || ""} onChange={(e) => setPdField("pay_plan", e.target.value)} className="w-full px-2 py-2.5 rounded-lg border border-input bg-background text-sm">
                  <option value="">—</option>
                  <option value="NF">NF</option>
                  <option value="NA">NA</option>
                  <option value="NL">NL</option>
                </select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Occ. series</Label><Input value={pd.occ_series || ""} onChange={(e) => setPdField("occ_series", e.target.value)} placeholder="0189" /></div>
              <div className="space-y-1"><Label className="text-xs">Pay band</Label><Input value={pd.pay_band || ""} onChange={(e) => setPdField("pay_band", e.target.value)} placeholder="02" /></div>
              <div className="space-y-1"><Label className="text-xs">Step</Label><Input value={pd.step || ""} onChange={(e) => setPdField("step", e.target.value)} placeholder="NA/NL only" /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1"><Label className="text-xs">Hourly rate</Label><Input value={pd.hourly_rate || ""} onChange={(e) => setPdField("hourly_rate", e.target.value)} placeholder="17.25" /></div>
              <div className="space-y-1">
                <Label className="text-xs">Work schedule</Label>
                <select value={pd.work_schedule || ""} onChange={(e) => setPdField("work_schedule", e.target.value)} className="w-full px-2 py-2.5 rounded-lg border border-input bg-background text-sm">
                  <option value="">—</option>
                  <option value="RFT">RFT</option>
                  <option value="RPT">RPT</option>
                  <option value="FLEX">FLEX</option>
                </select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Avg hrs (flex)</Label><Input value={pd.avg_hours || ""} onChange={(e) => setPdField("avg_hours", e.target.value)} placeholder="20" /></div>
              <div className="space-y-1">
                <Label className="text-xs">FLSA</Label>
                <select value={pd.flsa || ""} onChange={(e) => setPdField("flsa", e.target.value)} className="w-full px-2 py-2.5 rounded-lg border border-input bg-background text-sm">
                  <option value="">—</option>
                  <option value="E">E (Exempt)</option>
                  <option value="N">N (Nonexempt)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Home cost center</Label><Input value={pd.cost_center || ""} onChange={(e) => setPdField("cost_center", e.target.value)} placeholder="5-digit" /></div>
            </div>
          </div>

          {/* Active + direct reports */}
          <div className="flex items-center gap-3">
            <button onClick={() => setIsActive(!isActive)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? "bg-green-600" : "bg-gray-300"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <Label className="text-sm font-medium">{isActive ? "Active" : "Inactive"}</Label>
          </div>

          {reports.length > 0 && (
            <div className="text-sm">
              <span className="font-medium">Direct reports:</span>{" "}
              <span className="text-muted-foreground">{reports.map((r) => r.full_name).join(", ")}</span>
            </div>
          )}

          <Button onClick={handleSaveInfo} disabled={savingInfo || !fullName.trim()} className="gap-2 bg-[#1B4332] hover:bg-[#2D6A4F]">
            {savingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save changes
          </Button>
        </div>
      )}

      {/* ── DOCUMENTS ── */}
      {tab === "documents" && (
        <div className="space-y-5 max-w-xl">
          {/* Auto-fill */}
          <Card className="border-[#1B4332]/20 bg-[#1B4332]/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#1B4332]" />
                <p className="text-sm font-medium">Auto-fill info from a document</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Upload a photo or PDF (offer letter, application, ID). The AI reads it and pre-fills the Info tab for you to review. If it can&apos;t, just type the info in manually.
              </p>
              <input ref={autofillRef} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => handleAutofillFile(e.target.files?.[0])} />
              <Button variant="outline" size="sm" className="gap-2" disabled={autofillBusy} onClick={() => autofillRef.current?.click()}>
                {autofillBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {autofillBusy ? "Reading…" : "Choose document to read"}
              </Button>
              {autofillError && <p className="text-xs text-amber-700">{autofillError}</p>}
              {autofill && (
                <div className="rounded-lg border bg-background p-3 space-y-2 text-sm">
                  <p className="font-medium">Found:</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {autofill.full_name && <li>Name: {autofill.full_name}</li>}
                    {autofill.phone && <li>Phone: {autofill.phone}</li>}
                    {autofill.email && <li>Email: {autofill.email}</li>}
                    {autofill.hire_date && <li>Hire date: {autofill.hire_date}</li>}
                    {autofill.emergency_contact?.name && <li>Emergency: {autofill.emergency_contact.name} {autofill.emergency_contact.phone || ""}</li>}
                    {!autofill.full_name && !autofill.phone && !autofill.email && <li>Nothing clear — enter manually.</li>}
                  </ul>
                  <Button size="sm" className="gap-1.5 bg-[#1B4332] hover:bg-[#2D6A4F]" onClick={applyAutofill}>
                    <CheckCircle className="w-3.5 h-3.5" /> Apply to Info
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upload */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-sm font-medium">Upload a document</p>
            <input ref={docRef} type="file" className="block w-full text-sm" onChange={(e) => { const f = e.target.files?.[0] || null; setDocFile(f); if (f && !docName) setDocName(f.name); }} />
            {docFile && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="docName">Name</Label><Input id="docName" value={docName} onChange={(e) => setDocName(e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label htmlFor="docCat">Category</Label>
                  <select id="docCat" value={docCategory} onChange={(e) => setDocCategory(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base">
                    {DOC_CATEGORY_ORDER.map((c) => <option key={c} value={c}>{DOC_CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
              </div>
            )}
            {docError && <p className="text-xs text-red-600">{docError}</p>}
            <Button size="sm" className="gap-2" disabled={!docFile || uploadingDoc} onClick={handleUploadDoc}>
              {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents yet.</p>
            ) : (
              documents.map((d) => (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{DOC_CATEGORY_LABELS[d.category] || d.category} · {fmtDate(d.created_at)}</p>
                  </div>
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="w-4 h-4" /></a>
                  )}
                  <button onClick={() => deleteDocument(d)} className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── RECORDS ── */}
      {tab === "records" && (
        <div className="space-y-5 max-w-xl">
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-sm font-medium flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add a record</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="recType">Type</Label>
                <select id="recType" value={recType} onChange={(e) => setRecType(e.target.value as StaffRecordType)} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base">
                  {RECORD_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{RECORD_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="recDate">Date</Label><Input id="recDate" type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="recTitle">Title</Label><Input id="recTitle" value={recTitle} onChange={(e) => setRecTitle(e.target.value)} placeholder="Short summary" /></div>
            <div className="space-y-1.5"><Label htmlFor="recDetails">Details</Label><Textarea id="recDetails" rows={3} value={recDetails} onChange={(e) => setRecDetails(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              {RECORD_TYPES_WITH_HOURS.includes(recType) && (
                <div className="space-y-1.5"><Label htmlFor="recHours">Hours</Label><Input id="recHours" type="number" step="0.25" value={recHours} onChange={(e) => setRecHours(e.target.value)} /></div>
              )}
              {RECORD_TYPES_WITH_AMOUNT.includes(recType) && (
                <div className="space-y-1.5"><Label htmlFor="recAmount">Amount ($)</Label><Input id="recAmount" type="number" step="0.01" value={recAmount} onChange={(e) => setRecAmount(e.target.value)} /></div>
              )}
            </div>
            {recType === "one_on_one" && (
              <div className="space-y-1.5"><Label htmlFor="recFollow">Follow-up / action items</Label><Textarea id="recFollow" rows={2} value={recFollowUp} onChange={(e) => setRecFollowUp(e.target.value)} /></div>
            )}
            <Button size="sm" className="gap-2" disabled={addingRec} onClick={handleAddRecord}>
              {addingRec ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add record
            </Button>
          </div>

          <div className="space-y-2">
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">No records yet.</p>
            ) : (
              records.map((r) => (
                <div key={r.id} className="p-3 rounded-lg border space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RECORD_TYPE_COLORS[r.type]}`}>{RECORD_TYPE_LABELS[r.type]}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(r.event_date)}</span>
                    </div>
                    <button onClick={() => deleteRecord(r.id)} className="text-red-600 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {r.title && <p className="text-sm font-medium">{r.title}</p>}
                  {r.details && <p className="text-sm whitespace-pre-line">{r.details}</p>}
                  {(r.hours != null || r.amount != null) && (
                    <p className="text-xs text-muted-foreground">
                      {r.hours != null ? `${r.hours} hrs` : ""}{r.hours != null && r.amount != null ? " · " : ""}{r.amount != null ? `$${r.amount}` : ""}
                    </p>
                  )}
                  {r.follow_up && <p className="text-xs"><span className="font-medium">Follow-up:</span> {r.follow_up}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── 1:1s ── */}
      {tab === "oneonone" && (
        <div className="space-y-5 max-w-xl">
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-sm font-medium flex items-center gap-1.5"><Plus className="w-4 h-4" /> Log a 1:1</p>
            <div className="space-y-1.5"><Label htmlFor="ooDate">Date</Label><Input id="ooDate" type="date" value={ooDate} onChange={(e) => setOoDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ooDetails">What we talked about</Label><Textarea id="ooDetails" rows={4} value={ooDetails} onChange={(e) => setOoDetails(e.target.value)} placeholder="Notes from the conversation…" /></div>
            <div className="space-y-1.5"><Label htmlFor="ooFollow">Action items / follow-up for next time</Label><Textarea id="ooFollow" rows={2} value={ooFollowUp} onChange={(e) => setOoFollowUp(e.target.value)} /></div>
            <Button size="sm" className="gap-2 bg-[#1B4332] hover:bg-[#2D6A4F]" disabled={addingOo || !ooDetails.trim()} onClick={handleAddOneOnOne}>
              {addingOo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Save 1:1
            </Button>
          </div>

          <div className="space-y-2">
            {oneOnOnes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No 1:1s logged yet. After your next meeting, jot the notes here so you have history to go off of.</p>
            ) : (
              oneOnOnes.map((r) => (
                <div key={r.id} className="p-3 rounded-lg border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{fmtDate(r.event_date)}</span>
                    <button onClick={() => deleteRecord(r.id)} className="text-red-600 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {r.details && <p className="text-sm whitespace-pre-line">{r.details}</p>}
                  {r.follow_up && <p className="text-xs bg-muted/40 rounded p-2"><span className="font-medium">Action items:</span> {r.follow_up}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StaffProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
      <ProfileContent />
    </Suspense>
  );
}
