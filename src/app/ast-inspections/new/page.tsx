"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Save,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { resolveAccessToken } from "@/lib/api/client";
import { useProfiles, roleLabels } from "@/lib/hooks/useProfiles";
import {
  AST_INSPECTION_ITEMS,
  AST_SECTIONS,
  AST_TANK_TYPES,
  computeRetainUntilDate,
  isNonConforming,
  type AstSection,
  type AstTankType,
} from "@/lib/ast-inspection-items";
import type {
  AstInspection,
  AstInspectionItems,
  AstInspectionItemStatus,
} from "@/types/database";
import { formatLocalDate, todayLocal } from "@/lib/utils/date";

function todayIso(): string {
  return todayLocal();
}

function priorMonthIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return formatLocalDate(d);
}

function emptyItems(): AstInspectionItems {
  const out: AstInspectionItems = {};
  for (const def of AST_INSPECTION_ITEMS) {
    out[String(def.number)] = { status: null, comment: null };
  }
  return out;
}

function NewAstInspectionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const { profile, user, loading: authLoading } = useAuth();
  const {
    profiles: allProfiles,
    fetchProfiles,
    loading: profilesLoading,
    error: profilesError,
  } = useProfiles();

  const isAllowed =
    profile?.role === "super" ||
    profile?.role === "asst_super" ||
    profile?.role === "director" ||
    profile?.role === "gm";

  // ── Form state ────────────────────────────────────────────────────────────
  const [inspectionDate, setInspectionDate] = useState(todayIso());
  const [priorInspectionDate, setPriorInspectionDate] = useState(priorMonthIso());
  const [inspectorId, setInspectorId] = useState<string>(""); // profile id
  const [inspectorTitle, setInspectorTitle] = useState("");
  const [inspectorSignature, setInspectorSignature] = useState("");
  const [tankType, setTankType] = useState<AstTankType>("fuel");
  const [tankIds, setTankIds] = useState(AST_TANK_TYPES.fuel.tankIds);
  const [facilityName, setFacilityName] = useState("");
  // Facility ID is fixed at 8400 (Veterans Memorial Golf Course) for every
  // inspection — pre-fill so the user never has to type it. The field is
  // still editable in case a different site is ever added later.
  const [facilityId, setFacilityId] = useState("8400");
  const [items, setItems] = useState<AstInspectionItems>(() => emptyItems());
  const [additionalComments, setAdditionalComments] = useState("");

  const [loadingExisting, setLoadingExisting] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual override — used when the profiles list can't be loaded or the
  // user wants to type a name that isn't on staff (rare, but happens
  // when an inspector is from another facility).
  const [manualInspectorName, setManualInspectorName] = useState("");

  // Resolved inspector name. Prefer the picked profile's name; fall back
  // to whatever the user typed by hand.
  const inspectorName = useMemo(() => {
    const p = allProfiles.find((pp) => pp.id === inspectorId);
    const fromProfile = p?.full_name || p?.display_name || "";
    return fromProfile || manualInspectorName;
  }, [inspectorId, allProfiles, manualInspectorName]);

  // If the profiles fetch failed or finished with zero rows, switch the
  // UI into manual entry mode so the form isn't blocked.
  const useManualInspector =
    !profilesLoading && (!!profilesError || allProfiles.length === 0);

  // Load staff list once.
  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Default the inspector to the current user as soon as profiles load.
  useEffect(() => {
    if (editId) return;
    if (!user) return;
    if (inspectorId) return;
    if (allProfiles.length === 0) return;
    if (allProfiles.some((p) => p.id === user.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill once
      setInspectorId(user.id);
    }
  }, [editId, user, inspectorId, allProfiles]);

  // Default the title from the current user's role.
  useEffect(() => {
    if (editId) return;
    if (inspectorTitle) return;
    if (!profile?.role) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill once
    setInspectorTitle(roleLabels[profile.role] || "");
  }, [editId, profile?.role, inspectorTitle]);

  // Default the signature line to the inspector's full name (typed sig).
  useEffect(() => {
    if (editId) return;
    if (inspectorSignature) return;
    if (!inspectorName) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill once
    setInspectorSignature(inspectorName);
  }, [editId, inspectorName, inspectorSignature]);

  // Load existing record in edit mode.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from("ast_inspections")
        .select("*")
        .eq("id", editId)
        .maybeSingle();
      if (cancelled) return;
      if (fetchErr || !data) {
        setError(fetchErr?.message || "Inspection not found");
        setLoadingExisting(false);
        return;
      }
      const row = data as unknown as AstInspection;
      setInspectionDate(row.inspection_date);
      setPriorInspectionDate(row.prior_inspection_date || "");
      setInspectorId(row.inspector_id || "");
      setInspectorTitle(row.inspector_title || "");
      setInspectorSignature(row.inspector_signature || "");
      setTankIds(row.tank_ids);
      // Infer tank type from saved IDs so the picker reflects the right
      // selection in edit mode.
      const ids = row.tank_ids.toLowerCase();
      if (ids.includes("uco") || ids.includes("cooking")) setTankType("used_cooking_oil");
      else setTankType("fuel");
      setFacilityName(row.facility_name || "");
      setFacilityId(row.facility_id || "");
      setItems({ ...emptyItems(), ...(row.items || {}) });
      setAdditionalComments(row.additional_comments || "");
      setLoadingExisting(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const retainUntilDate = useMemo(
    () => computeRetainUntilDate(inspectionDate),
    [inspectionDate],
  );

  const totals = useMemo(() => {
    let answered = 0;
    let nonConforming = 0;
    for (const def of AST_INSPECTION_ITEMS) {
      const entry = items[String(def.number)];
      if (entry?.status) answered++;
      if (entry && isNonConforming(def, entry.status)) nonConforming++;
    }
    return { answered, nonConforming, total: AST_INSPECTION_ITEMS.length };
  }, [items]);

  const allAnswered = totals.answered === totals.total;

  // ── Handlers ──────────────────────────────────────────────────────────────
  function setItemStatus(num: number, status: AstInspectionItemStatus) {
    setItems((prev) => ({
      ...prev,
      [String(num)]: { ...prev[String(num)], status },
    }));
  }

  function setItemComment(num: number, comment: string) {
    setItems((prev) => ({
      ...prev,
      [String(num)]: {
        ...prev[String(num)],
        comment: comment.trim() ? comment : null,
      },
    }));
  }

  async function handleSave(asDraft: boolean) {
    if (!user) {
      setError("Not signed in.");
      return;
    }
    if (!inspectorName.trim()) {
      setError("Pick an inspector from the staff list.");
      return;
    }
    if (!tankIds.trim()) {
      setError("At least one tank ID is required.");
      return;
    }
    if (!asDraft && !allAnswered) {
      setError(
        `Answer all ${totals.total} items before saving as completed (${totals.answered}/${totals.total} answered).`,
      );
      return;
    }

    setSaving(true);
    setError(null);

    const supabase = createClient();
    const payload = {
      inspection_date: inspectionDate,
      prior_inspection_date: priorInspectionDate || null,
      retain_until_date: retainUntilDate,
      inspector_id: inspectorId || user.id,
      inspector_name: inspectorName.trim(),
      inspector_title: inspectorTitle.trim() || null,
      inspector_signature: inspectorSignature.trim() || null,
      tank_ids: tankIds.trim(),
      facility_name: facilityName.trim() || null,
      facility_id: facilityId.trim() || null,
      items,
      additional_comments: additionalComments.trim() || null,
      status: asDraft ? "draft" : "completed",
    };

    // Direct PostgREST write — supabase.from(…).insert(…) is wrapped in
    // supabase-js's auth path, which has been observed to wedge mid-save
    // and stall the form indefinitely. Using fetch with a localStorage-
    // cached JWT removes that dependency. Same pattern as PR save.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    let token: string;
    try {
      token = await resolveAccessToken(supabase, supabaseUrl, anonKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth lookup failed");
      setSaving(false);
      return;
    }
    const restHeaders: HeadersInit = {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    if (editId) {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/ast_inspections?id=eq.${encodeURIComponent(editId)}`,
          {
            method: "PATCH",
            headers: { ...restHeaders, Prefer: "return=minimal" },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) {
          let message = `Update failed: ${res.status} ${res.statusText}`;
          try {
            const errBody = (await res.json()) as { message?: string };
            if (errBody?.message) message = errBody.message;
          } catch {
            /* ignore */
          }
          setError(message);
          setSaving(false);
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
        setSaving(false);
        return;
      }
      router.push(`/ast-inspections/view?id=${editId}`);
    } else {
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/ast_inspections`, {
          method: "POST",
          headers: { ...restHeaders, Prefer: "return=representation" },
          body: JSON.stringify({ ...payload, created_by: user.id }),
        });
        if (!res.ok) {
          let message = `Save failed: ${res.status} ${res.statusText}`;
          try {
            const errBody = (await res.json()) as { message?: string };
            if (errBody?.message) message = errBody.message;
          } catch {
            /* ignore */
          }
          setError(message);
          setSaving(false);
          return;
        }
        const json = (await res.json()) as Array<{ id: string }>;
        const newId = json?.[0]?.id;
        if (!newId) {
          setError("Saved but no id returned. Refresh the inspections list.");
          setSaving(false);
          return;
        }
        router.push(`/ast-inspections/view?id=${newId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
        setSaving(false);
        return;
      }
    }
  }

  // ── Render guards ─────────────────────────────────────────────────────────
  if (authLoading || loadingExisting) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="p-3 pb-32 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/ast-inspections"
            className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold">New AST Inspection</h1>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Access Restricted</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 pb-40 max-w-2xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Link
          href="/ast-inspections"
          className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">
            {editId ? "Edit Inspection" : "New Monthly Inspection"}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            STI SP001 visual checklist
          </p>
        </div>
      </div>

      {/* General Information — single column on mobile */}
      <section className="mt-4 rounded-xl border border-border bg-card p-3 space-y-3">
        <h2 className="font-semibold text-sm">General Information</h2>

        <Field label="Inspection Date">
          <input
            type="date"
            value={inspectionDate}
            onChange={(e) => setInspectionDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base"
          />
        </Field>

        <Field label="Prior Inspection Date">
          <input
            type="date"
            value={priorInspectionDate}
            onChange={(e) => setPriorInspectionDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base"
          />
        </Field>

        <Field
          label="Retain Until"
          hint="Auto-calculated: 36 months from inspection date"
        >
          <input
            type="text"
            value={retainUntilDate}
            readOnly
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/40 text-base text-muted-foreground"
          />
        </Field>

        <Field
          label="Inspector"
          hint={
            useManualInspector
              ? "Couldn't load the staff list — type the inspector's name instead."
              : undefined
          }
        >
          {profilesLoading ? (
            <div className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
              Loading staff...
            </div>
          ) : useManualInspector ? (
            <input
              type="text"
              value={manualInspectorName}
              onChange={(e) => {
                setManualInspectorName(e.target.value);
                if (e.target.value && !inspectorSignature) {
                  setInspectorSignature(e.target.value);
                }
              }}
              placeholder="Inspector full name"
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base"
            />
          ) : (
            <select
              value={inspectorId}
              onChange={(e) => {
                setInspectorId(e.target.value);
                // Update signature to match new inspector by default
                const p = allProfiles.find((pp) => pp.id === e.target.value);
                const name = p?.full_name || p?.display_name || "";
                if (name) setInspectorSignature(name);
                if (p?.role) setInspectorTitle(roleLabels[p.role] || "");
              }}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base"
            >
              <option value="">— Pick a staff member —</option>
              {allProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.display_name || "(no name)"}
                  {p.id === user?.id ? " (you)" : ""}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Title">
          <input
            type="text"
            value={inspectorTitle}
            onChange={(e) => setInspectorTitle(e.target.value)}
            placeholder="e.g. Superintendent"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base"
          />
        </Field>

        <Field
          label="Signature"
          hint="Type full name to sign"
        >
          <input
            type="text"
            value={inspectorSignature}
            onChange={(e) => setInspectorSignature(e.target.value)}
            placeholder="Type full name"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base font-serif italic"
          />
        </Field>

        <Field
          label="Tank Type *"
          hint="SP001 requires one inspection per tank category."
        >
          <select
            value={tankType}
            onChange={(e) => {
              const t = e.target.value as AstTankType;
              setTankType(t);
              setTankIds(AST_TANK_TYPES[t].tankIds);
            }}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base"
          >
            {Object.entries(AST_TANK_TYPES).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Tank(s) Inspected ID"
          hint="Auto-filled from the tank type — edit if a tank changes."
        >
          <input
            type="text"
            value={tankIds}
            onChange={(e) => setTankIds(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base"
          />
        </Field>

        <Field label="Facility Name">
          <input
            type="text"
            value={facilityName}
            onChange={(e) => setFacilityName(e.target.value)}
            placeholder="Veterans Memorial Golf Course"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base"
          />
        </Field>

        <Field label="Facility ID">
          <input
            type="text"
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            placeholder="optional"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base"
          />
        </Field>
      </section>

      {/* Status badge — sticky-ish summary */}
      <div className="mt-3 flex items-center gap-2 text-sm flex-wrap">
        <span
          className={`px-2 py-1 rounded-md font-medium ${
            allAnswered
              ? "bg-green-500/15 text-green-700 dark:text-green-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {totals.answered}/{totals.total} answered
        </span>
        {totals.nonConforming > 0 && (
          <span className="px-2 py-1 rounded-md font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {totals.nonConforming} non-conforming
          </span>
        )}
      </div>

      {/* Sections of inspection items */}
      {AST_SECTIONS.map((section) => (
        <SectionBlock
          key={section}
          section={section}
          items={items}
          onStatus={setItemStatus}
          onComment={setItemComment}
        />
      ))}

      {/* Additional comments */}
      <section className="mt-3 rounded-xl border border-border bg-card p-3">
        <h2 className="font-semibold text-sm mb-2">Additional Comments</h2>
        <textarea
          value={additionalComments}
          onChange={(e) => setAdditionalComments(e.target.value)}
          rows={4}
          placeholder="Anything else worth noting..."
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-base resize-none"
        />
      </section>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Save bar */}
      <div className="mt-3 flex flex-col gap-2">
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {saving ? "Saving..." : editId ? "Update Inspection" : "Save Inspection"}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 transition-all"
        >
          <Save className="w-4 h-4" />
          Save as Draft
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function SectionBlock({
  section,
  items,
  onStatus,
  onComment,
}: {
  section: AstSection;
  items: AstInspectionItems;
  onStatus: (num: number, status: AstInspectionItemStatus) => void;
  onComment: (num: number, value: string) => void;
}) {
  const sectionItems = AST_INSPECTION_ITEMS.filter((i) => i.section === section);

  return (
    <section className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
      <header className="px-3 py-2 bg-muted/40 border-b border-border">
        <h2 className="font-semibold text-sm">{section}</h2>
      </header>
      <div className="divide-y divide-border">
        {sectionItems.map((def) => {
          const entry = items[String(def.number)];
          const status = entry?.status ?? null;
          const flagged = isNonConforming(def, status);
          return (
            <div key={def.number} className="p-3 space-y-2.5">
              {/* Prompt row — number badge + question */}
              <div className="flex items-start gap-2">
                <span
                  className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ${
                    flagged
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : status
                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {def.number}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug break-words">
                    {def.prompt}
                  </p>
                  {def.note && (
                    <p className="text-[11px] text-muted-foreground mt-1 italic break-words">
                      {def.note}
                    </p>
                  )}
                </div>
              </div>

              {/* Yes / No / N/A buttons — full width row, equal widths */}
              <div
                className={`grid gap-1.5 ${
                  def.allowsNa ? "grid-cols-3" : "grid-cols-2"
                }`}
              >
                <StatusButton
                  active={status === "yes"}
                  warn={def.yesIsNonConforming}
                  onClick={() => onStatus(def.number, "yes")}
                  label={def.yesIsNonConforming ? "Yes *" : "Yes"}
                />
                <StatusButton
                  active={status === "no"}
                  warn={!def.yesIsNonConforming}
                  onClick={() => onStatus(def.number, "no")}
                  label={def.yesIsNonConforming ? "No" : "No *"}
                />
                {def.allowsNa && (
                  <StatusButton
                    active={status === "na"}
                    onClick={() => onStatus(def.number, "na")}
                    label="N/A"
                  />
                )}
              </div>

              {/* Comment field — required when flagged */}
              <input
                type="text"
                value={entry?.comment || ""}
                onChange={(e) => onComment(def.number, e.target.value)}
                placeholder={
                  flagged
                    ? "Required: describe issue + corrective action"
                    : "Comments (optional)"
                }
                className={`w-full px-3 py-2 rounded-lg border bg-background text-sm ${
                  flagged && !entry?.comment
                    ? "border-amber-500/60"
                    : "border-border"
                }`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatusButton({
  active,
  warn,
  onClick,
  label,
}: {
  active: boolean;
  warn?: boolean;
  onClick: () => void;
  label: string;
}) {
  const base =
    "w-full px-2 py-2.5 rounded-lg text-sm font-semibold border transition-colors active:scale-[0.97]";
  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} ${
          warn
            ? "bg-amber-500 border-amber-500 text-white"
            : "bg-primary border-primary text-primary-foreground"
        }`}
      >
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} bg-background border-border text-foreground hover:bg-muted`}
    >
      {label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page wrapper (Suspense boundary required for useSearchParams during SSG)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Wrapper that re-mounts the inner page when `?id=…` changes. Without this,
 * navigating from /new?id=A to /new (fresh) keeps the previous form state
 * because the pathname didn't change.
 */
function NewAstInspectionPageKeyed() {
  const editId = useSearchParams().get("id");
  return <NewAstInspectionPageInner key={editId || "new"} />;
}

export default function NewAstInspectionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
          Loading...
        </div>
      }
    >
      <NewAstInspectionPageKeyed />
    </Suspense>
  );
}
