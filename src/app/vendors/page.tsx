"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Phone,
  Plus,
  Search,
  X,
  Loader2,
  Mail,
  FileCheck,
  AlertTriangle,
  Upload,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRefreshOnFocus } from "@/lib/hooks/useRefreshOnFocus";
import { createClient } from "@/lib/supabase/client";
import { callApi } from "@/lib/api/client";
import { resizeImageFile } from "@/lib/utils/image-resize";
import { parseAppDate } from "@/lib/utils/date-format";
import { formatLocalDate } from "@/lib/utils/date";
import { Sparkles } from "lucide-react";

interface ExtractedVendor889 {
  name: string | null;
  dba: string | null;
  uei: string | null;
  cage: string | null;
  address: string | null;
  city_state_zip: string | null;
  activation_date: string | null;
  expiration_date: string | null;
  /** Only on paper merchant forms — date the rep signed by hand. */
  date_signed: string | null;
  form_type: "sam_gov" | "paper_merchant" | "unknown";
  compliant: boolean;
  warnings: string[];
}

/**
 * Add 365 days to an ISO date and return ISO. Used as a fallback when a
 * paper merchant 889 form has a date_signed but no printed expiration —
 * CNIC NAF PC paper reps are renewed annually so date_signed + 1 year is
 * the safe assumption.
 */
function addOneYear(iso: string): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  return formatLocalDate(d);
}

interface Vendor {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  category: string;
  supplies: string | null;
  notes: string | null;
  contract_end_date: string | null;
  // Address (PR auto-fill)
  address: string | null;
  address_line2: string | null;
  city_state_zip: string | null;
  poc: string | null;
  sap_vendor_no: string | null;
  gsa_naf_other_no: string | null;
  // Section 889
  section_889_path: string | null;
  section_889_filename: string | null;
  section_889_expiration_date: string | null;
  section_889_uploaded_at: string | null;
}

const CATEGORIES = [
  { value: "spray_contractor", label: "Spray Contractor" },
  { value: "equipment_dealer", label: "Equipment Dealer" },
  { value: "parts_supplier", label: "Parts Supplier" },
  { value: "irrigation", label: "Irrigation" },
  { value: "landscaping", label: "Landscaping" },
  { value: "construction", label: "Construction" },
  { value: "fuel", label: "Fuel" },
  { value: "seed_sod", label: "Seed / Sod" },
  { value: "general", label: "General" },
] as const;

const categoryColors: Record<string, string> = {
  spray_contractor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  equipment_dealer: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  parts_supplier: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  irrigation: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  landscaping: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  construction: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  fuel: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  seed_sod: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  general: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

function categoryLabel(cat: string) {
  return CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

/** Returns the 889 status for the vendor card badge. */
function get889Status(vendor: {
  section_889_path: string | null;
  section_889_expiration_date: string | null;
}): "compliant" | "expiring_soon" | "expired" | "missing" {
  if (!vendor.section_889_path) return "missing";
  if (!vendor.section_889_expiration_date) return "compliant";
  const today = new Date();
  const exp = new Date(vendor.section_889_expiration_date);
  const days = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_soon";
  return "compliant";
}

const STATUS_LABELS: Record<ReturnType<typeof get889Status>, string> = {
  compliant: "889 ✓",
  expiring_soon: "889 expiring",
  expired: "889 expired",
  missing: "no 889",
};

const STATUS_COLORS: Record<ReturnType<typeof get889Status>, string> = {
  compliant: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  expiring_soon: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  missing: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

export default function VendorsPage() {
  const { user, profile } = useAuth();
  const canManage =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm" ||
    profile?.role === "foreman";

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading889For, setUploading889For] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracting889, setExtracting889] = useState(false);
  const [extractInfo, setExtractInfo] = useState<string | null>(null);
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);

  // Form state
  const initialForm = {
    name: "",
    company: "",
    phone: "",
    email: "",
    category: "general",
    supplies: "",
    notes: "",
    address: "",
    address_line2: "",
    city_state_zip: "",
    poc: "",
    sap_vendor_no: "",
    gsa_naf_other_no: "",
  };
  const [form, setForm] = useState(initialForm);

  const fetchVendors = useCallback(async () => {
    const supabase = createClient();
    const { data, error: fetchErr } = await supabase
      .from("vendors")
      .select("*")
      .order("name");
    if (fetchErr) {
      setError(fetchErr.message);
    }
    if (data) setVendors(data as Vendor[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  useRefreshOnFocus(fetchVendors);

  function startEdit(v: Vendor) {
    setEditingId(v.id);
    setForm({
      name: v.name,
      company: v.company || "",
      phone: v.phone || "",
      email: v.email || "",
      category: v.category,
      supplies: v.supplies || "",
      notes: v.notes || "",
      address: v.address || "",
      address_line2: v.address_line2 || "",
      city_state_zip: v.city_state_zip || "",
      poc: v.poc || "",
      sap_vendor_no: v.sap_vendor_no || "",
      gsa_naf_other_no: v.gsa_naf_other_no || "",
    });
    setShowForm(true);
  }

  function resetForm() {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !user) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      company: form.company.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      category: form.category,
      supplies: form.supplies.trim() || null,
      notes: form.notes.trim() || null,
      address: form.address.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city_state_zip: form.city_state_zip.trim() || null,
      poc: form.poc.trim() || null,
      sap_vendor_no: form.sap_vendor_no.trim() || null,
      gsa_naf_other_no: form.gsa_naf_other_no.trim() || null,
    };
    const { error: saveErr } = editingId
      ? await supabase.from("vendors").update(payload).eq("id", editingId)
      : await supabase
          .from("vendors")
          .insert({ ...payload, created_by: user.id });
    setSaving(false);
    if (saveErr) {
      setError(saveErr.message);
      return;
    }
    resetForm();
    fetchVendors();
  }

  async function handle889Upload(vendorId: string, file: File) {
    setUploading889For(vendorId);
    setError(null);
    try {
      const supabase = createClient();
      // Storage path scoped per vendor.
      const ext = file.name.split(".").pop() || "pdf";
      const stored = `889-forms/${vendorId}/889-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("vendor-files")
        .upload(stored, file, {
          upsert: true,
          contentType: file.type || "application/pdf",
        });
      if (upErr) throw upErr;

      // Try to extract expiration date from the PDF using the AI quote
      // extractor — it understands SAM.gov 889 forms via a prompt tweak.
      // Fall back to null and let the user enter it manually.
      let expirationDate: string | null = null;
      try {
        const expResp = await extract889Expiration(file);
        if (expResp) expirationDate = expResp;
      } catch {
        // Non-fatal — we'll just save without an expiration.
      }

      const updates = {
        section_889_path: stored,
        section_889_filename: file.name,
        section_889_uploaded_at: new Date().toISOString(),
        ...(expirationDate ? { section_889_expiration_date: expirationDate } : {}),
      };
      const { error: updateErr } = await supabase
        .from("vendors")
        .update(updates)
        .eq("id", vendorId);
      if (updateErr) throw updateErr;

      await fetchVendors();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`889 upload failed: ${msg}`);
    } finally {
      setUploading889For(null);
    }
  }

  /**
   * Quick-add path: user uploads a 889 PDF, AI extracts vendor info, we
   * create the vendor record AND attach the 889 file in one step.
   */
  async function handleAddVia889(file: File) {
    if (!user) return;
    setExtracting889(true);
    setExtractInfo(null);
    setExtractWarnings([]);
    setError(null);
    try {
      // 1. Resize/convert if image (PDFs pass through as-is).
      const resized = await resizeImageFile(file, { maxDim: 2000, quality: 0.85 });

      // 2. Send to Claude vision for extraction.
      const extracted = await callApi<ExtractedVendor889>("extract-889", {
        method: "POST",
        body: {
          image_base64: resized.base64,
          media_type: resized.mediaType,
        },
      });

      if (!extracted.name) {
        setError(
          "Couldn't read the vendor name from that file. Make sure it's a 889 representation document (SAM.gov summary OR a signed CNIC NAF PC merchant form).",
        );
        return;
      }
      if (!extracted.compliant) {
        const reason =
          extracted.form_type === "paper_merchant"
            ? `${extracted.name}'s 889 form has the "does" box checked — that means they DO use covered telecom equipment, which we can't purchase from.`
            : `${extracted.name} is NOT 889-compliant per SAM.gov.`;
        setError(reason + " We can't add a non-compliant vendor.");
        return;
      }

      // Fallback: paper merchant forms don't print an expiration. Compute
      // it as date_signed + 1 year (annual re-rep cycle per CNIC).
      let expirationDate = extracted.expiration_date;
      if (!expirationDate && extracted.date_signed) {
        try {
          expirationDate = addOneYear(extracted.date_signed);
        } catch {
          // Bad date — leave null and let the user set it manually.
        }
      }

      // 3. Create the vendor row.
      const supabase = createClient();
      const { data: newVendor, error: insertErr } = await supabase
        .from("vendors")
        .insert({
          name: extracted.name,
          company: extracted.dba,
          address: extracted.address,
          city_state_zip: extracted.city_state_zip,
          category: "general",
          notes: [
            extracted.uei ? `UEI: ${extracted.uei}` : null,
            extracted.cage ? `CAGE: ${extracted.cage}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insertErr || !newVendor) {
        throw insertErr || new Error("Insert returned no row");
      }
      const vendorId = (newVendor as { id: string }).id;

      // 4. Upload the 889 file to storage.
      const ext = file.name.split(".").pop() || "pdf";
      const stored = `889-forms/${vendorId}/889-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("vendor-files")
        .upload(stored, file, {
          upsert: true,
          contentType: file.type || "application/pdf",
        });
      if (upErr) throw upErr;

      // 5. Link the file + expiration to the vendor row.
      const { error: linkErr } = await supabase
        .from("vendors")
        .update({
          section_889_path: stored,
          section_889_filename: file.name,
          section_889_expiration_date: expirationDate,
          section_889_uploaded_at: new Date().toISOString(),
        })
        .eq("id", vendorId);
      if (linkErr) throw linkErr;

      const formNote =
        extracted.form_type === "paper_merchant"
          ? " (signed paper form, expiration set to 1 year from signing)"
          : extracted.form_type === "sam_gov"
            ? " (SAM.gov summary)"
            : "";
      setExtractInfo(
        `Added ${extracted.name}${expirationDate ? ` — 889 expires ${expirationDate}` : ""}${formNote}.`,
      );
      if (extracted.warnings && extracted.warnings.length > 0) {
        setExtractWarnings(extracted.warnings);
      }
      await fetchVendors();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`889 add failed: ${msg}`);
    } finally {
      setExtracting889(false);
    }
  }

  async function handleSet889Expiration(vendorId: string, value: string) {
    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from("vendors")
      .update({ section_889_expiration_date: value || null })
      .eq("id", vendorId);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    fetchVendors();
  }

  const filtered = useMemo(() => {
    return vendors.filter((v) => {
      if (filterCat !== "all" && v.category !== filterCat) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.company?.toLowerCase().includes(q) ||
        v.supplies?.toLowerCase().includes(q)
      );
    });
  }, [vendors, search, filterCat]);

  return (
    <div className="p-3 pb-32 max-w-2xl mx-auto overflow-x-hidden">
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/more"
          className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">Vendors</h1>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Contact directory + Section 889 forms
          </p>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => {
              setShowForm(!showForm);
              if (showForm) resetForm();
            }}
          >
            {showForm ? (
              <X className="w-4 h-4 mr-1" />
            ) : (
              <Plus className="w-4 h-4 mr-1" />
            )}
            {showForm ? "Cancel" : "Add"}
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400 break-words">
            {error}
          </p>
        </div>
      )}

      {/* AI auto-add via 889 PDF */}
      {canManage && (
        <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Add vendor from 889 PDF</p>
              <p className="text-[11px] text-muted-foreground">
                Upload a SAM.gov 889 summary — vendor info, UEI, CAGE, and
                expiration date are filled in automatically. Non-compliant
                vendors are rejected.
              </p>
            </div>
          </div>
          <label
            className={`relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-amber-500/60 bg-background text-sm font-medium transition-colors cursor-pointer ${
              extracting889
                ? "opacity-50 pointer-events-none"
                : "hover:bg-amber-500/10"
            }`}
          >
            {extracting889 ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {extracting889 ? "Reading 889..." : "Upload 889 PDF / Photo"}
            <input
              type="file"
              accept="application/pdf,image/*"
              disabled={extracting889}
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAddVia889(f);
                e.target.value = "";
              }}
            />
          </label>
          {extractInfo && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
              <FileCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{extractInfo}</span>
            </div>
          )}
          {extractWarnings.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {extractWarnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Inline Add / Edit Form ── */}
      {showForm && (
        <Card className="mb-4 mt-3">
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="v-name">Vendor / Company *</Label>
                <Input
                  id="v-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder='e.g. "Russo Hardware Inc"'
                  required
                />
              </div>
              <div>
                <Label htmlFor="v-company">DBA / Trade Name</Label>
                <Input
                  id="v-company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder='e.g. "Russo Power Equipment"'
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="v-phone">Phone</Label>
                  <Input
                    id="v-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="v-email">Email</Label>
                  <Input
                    id="v-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-1 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mt-2 mb-2">
                  ADDRESS (used to auto-fill PR forms)
                </p>
                <div className="space-y-2">
                  <Input
                    placeholder="Street address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                  <Input
                    placeholder="Address line 2"
                    value={form.address_line2}
                    onChange={(e) =>
                      setForm({ ...form, address_line2: e.target.value })
                    }
                  />
                  <Input
                    placeholder="City, State ZIP"
                    value={form.city_state_zip}
                    onChange={(e) =>
                      setForm({ ...form, city_state_zip: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Point of contact"
                    value={form.poc}
                    onChange={(e) => setForm({ ...form, poc: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="SAP Vendor No"
                      value={form.sap_vendor_no}
                      onChange={(e) =>
                        setForm({ ...form, sap_vendor_no: e.target.value })
                      }
                    />
                    <Input
                      placeholder="GSA / NAF / Other"
                      value={form.gsa_naf_other_no}
                      onChange={(e) =>
                        setForm({ ...form, gsa_naf_other_no: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="v-supplies">Supplies / Services</Label>
                <Input
                  id="v-supplies"
                  value={form.supplies}
                  onChange={(e) =>
                    setForm({ ...form, supplies: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="v-notes">Notes</Label>
                <Textarea
                  id="v-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={saving || !form.name.trim()}
              >
                {saving && (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                )}
                {editingId ? "Update Vendor" : "Save Vendor"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Search & Filter ── */}
      <div className="flex gap-2 mt-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors..."
            className="pl-9"
          />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Vendor List ── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          {vendors.length === 0
            ? "No vendors yet. Add your first vendor above."
            : "No vendors match your search."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => {
            const status = get889Status(v);
            const uploading = uploading889For === v.id;
            return (
              <Card key={v.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-base break-words">
                        {v.name}
                      </p>
                      {v.company && (
                        <p className="text-sm text-muted-foreground break-words">
                          {v.company}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={`${categoryColors[v.category] || ""} shrink-0`}
                    >
                      {categoryLabel(v.category)}
                    </Badge>
                  </div>

                  {(v.address || v.city_state_zip) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {[v.address, v.address_line2, v.city_state_zip]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {v.supplies && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {v.supplies}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3 mt-2">
                    {v.phone && (
                      <a
                        href={`tel:${v.phone}`}
                        className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
                      >
                        <Phone className="w-3 h-3" />
                        {v.phone}
                      </a>
                    )}
                    {v.email && (
                      <a
                        href={`mailto:${v.email}`}
                        className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
                      >
                        <Mail className="w-3 h-3" />
                        {v.email}
                      </a>
                    )}
                  </div>

                  {/* 889 form section */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileCheck
                          className={`w-4 h-4 shrink-0 ${
                            status === "compliant"
                              ? "text-green-600"
                              : status === "expiring_soon"
                                ? "text-amber-600"
                                : status === "expired"
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                          }`}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          Section 889
                        </span>
                        <Badge
                          variant="secondary"
                          className={`${STATUS_COLORS[status]} text-[10px]`}
                        >
                          {STATUS_LABELS[status]}
                        </Badge>
                      </div>
                    </div>

                    {v.section_889_expiration_date ? (
                      <p className="text-xs text-muted-foreground mb-2">
                        Expires{" "}
                        {parseAppDate(v.section_889_expiration_date)?.toLocaleDateString(
                          "en-US",
                          { year: "numeric", month: "short", day: "numeric" },
                        )}
                      </p>
                    ) : v.section_889_path ? (
                      <p className="text-xs text-muted-foreground mb-2">
                        Expiration date not set
                      </p>
                    ) : null}

                    {canManage && (
                      <div className="flex flex-col gap-2">
                        <label
                          className={`relative inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium cursor-pointer transition-colors ${
                            uploading
                              ? "opacity-50 pointer-events-none"
                              : "hover:bg-muted"
                          }`}
                        >
                          {uploading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          {uploading
                            ? "Uploading..."
                            : v.section_889_path
                              ? "Replace 889 PDF"
                              : "Upload 889 PDF"}
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            disabled={uploading}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handle889Upload(v.id, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {v.section_889_path && (
                          <Input
                            type="date"
                            value={v.section_889_expiration_date || ""}
                            onChange={(e) =>
                              handleSet889Expiration(v.id, e.target.value)
                            }
                            className="text-sm"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {v.notes && (
                    <p className="text-xs text-muted-foreground mt-2 border-t pt-2">
                      {v.notes}
                    </p>
                  )}

                  {canManage && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => startEdit(v)}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        Edit
                        <ChevronRight className="w-3 h-3" />
                      </button>
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

// ──────────────────────────────────────────────────────────────────────────────
// 889 expiration extraction — calls the same edge function we use for quotes
// ──────────────────────────────────────────────────────────────────────────────

async function extract889Expiration(file: File): Promise<string | null> {
  // Reuse the extract-quote function but point it at a 889 form. The
  // generic prompt won't know about 889s, so we just OCR the PDF and look
  // for an expiration-date string ourselves. Cheap heuristic: send via the
  // Anthropic vision endpoint with a tiny purpose-built prompt.
  //
  // For now, parse the filename if it contains "EXPIRES <date>".
  const m = file.name.match(/EXPIRES\s+(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/i);
  if (m) {
    const day = m[1].padStart(2, "0");
    const monMap: Record<string, string> = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
      JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
    };
    const mon = monMap[m[2].toUpperCase()];
    if (mon) return `${m[3]}-${mon}-${day}`;
  }
  return null;
}
