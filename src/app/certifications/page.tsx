"use client";

// Certification & license tracker (Operation Blueprint Phase 5): food
// handler cards, cash handling, the pesticide applicator license — with
// expiry badges here and alarm rows on Today. Renewing = updating the
// expiry date; the old card photo stays on the record until replaced.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  Check,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directRpc,
  directSelectList,
} from "@/lib/supabase/rest";
import {
  openPrivateStorageFile,
  removePrivateStorageFile,
  uploadCertificationDocument,
} from "@/lib/supabase/storage";
import { ADMIN_ROLES } from "@/components/auth/role-guard";
import {
  CERT_LEAD_DAYS,
  evaluateCerts,
  type Certification,
  type EvaluatedCert,
} from "@/lib/people/certs";

const STATUS_BADGE: Record<
  EvaluatedCert["status"],
  { label: (d: number | null) => string; className: string }
> = {
  expired: {
    label: (d) => (d === -1 ? "Expired yesterday" : `Expired ${-(d ?? 0)} days ago`),
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  expiring: {
    label: (d) => (d === 0 ? "Expires today" : `Expires in ${d} days`),
    className: "bg-warning/15 text-warning-foreground border-warning/40",
  },
  ok: {
    label: () => "Current",
    className: "bg-success/10 text-success border-success/30",
  },
  no_expiry: {
    label: () => "No expiry",
    className: "bg-muted text-muted-foreground border-border",
  },
};

interface StaffOption {
  id: string;
  full_name: string | null;
  display_name: string | null;
}

export default function CertificationsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const canManage = !!profile && ADMIN_ROLES.includes(profile.role);
  const [certs, setCerts] = useState<Certification[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Certification | null>(null);
  const [saving, setSaving] = useState(false);
  const [fProfileId, setFProfileId] = useState("");
  const [fHolder, setFHolder] = useState("");
  const [fName, setFName] = useState("");
  const [fLicense, setFLicense] = useState("");
  const [fIssued, setFIssued] = useState("");
  const [fExpires, setFExpires] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!canManage) {
      setCerts([]);
      setStaff([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [rows, staffRows] = await Promise.all([
        directSelectList<Certification>("certifications", {
          columns: "*",
          filters: ["is_active=eq.true"],
          limit: 500,
          label: "certs.list",
        }),
        directSelectList<StaffOption>("staff_directory", {
          columns: "id,full_name,display_name",
          filters: ["is_active=eq.true"],
          orderBy: [{ column: "full_name", ascending: true }],
          limit: 500,
          label: "certs.staffDirectory",
        }),
      ]);
      setCerts(rows);
      setStaff(staffRows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const evaluated = useMemo(() => evaluateCerts(certs, new Date()), [certs]);

  const openAdd = () => {
    setEditing(null);
    setFProfileId("");
    setFHolder("");
    setFName("");
    setFLicense("");
    setFIssued("");
    setFExpires("");
    setFNotes("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setShowForm(true);
  };

  const openEdit = (c: Certification) => {
    setEditing(c);
    setFProfileId(c.profile_id ?? "");
    setFHolder(c.holder);
    setFName(c.cert_name);
    setFLicense(c.license_number ?? "");
    setFIssued(c.issued_date ?? "");
    setFExpires(c.expires_date ?? "");
    setFNotes(c.notes ?? "");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setShowForm(true);
  };

  const save = async () => {
    if (!fHolder.trim() || !fName.trim() || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    let orphanedUploadPath: string | null = null;
    try {
      // Card/license photo is best-effort — the record must never block.
      let documentPath = editing?.document_path ?? null;
      let uploadFailed = false;
      if (file) {
        if (!user?.id) {
          uploadFailed = true;
        } else {
          try {
            const up = await uploadCertificationDocument(file, user.id);
            documentPath = up.storagePath;
            orphanedUploadPath = up.storagePath;
          } catch {
            uploadFailed = true;
          }
        }
      }

      const row = {
        holder: fHolder.trim(),
        profile_id: fProfileId || null,
        cert_name: fName.trim(),
        license_number: fLicense.trim() || null,
        issued_date: fIssued || null,
        expires_date: fExpires || null,
        document_path: documentPath,
        document_bucket: file
          ? "certification-documents"
          : (editing?.document_bucket ?? "certification-documents"),
        notes: fNotes.trim() || null,
      };

      await directRpc("save_certification", {
        p_certification_id: editing?.id ?? null,
        p_values: row,
        p_reason: editing
          ? "Certification record updated"
          : "Certification record created",
      }, editing ? "certs.update" : "certs.insert");
      orphanedUploadPath = null;
      setShowForm(false);
      await load();
      setNotice(
        uploadFailed
          ? "Saved — but the card photo didn't upload. You can re-add it with Edit."
          : editing
            ? "Certification updated."
            : "Certification added.",
      );
    } catch (e) {
      if (orphanedUploadPath) {
        try {
          await removePrivateStorageFile("certification-documents", orphanedUploadPath);
        } catch {
          // The manager can still remove an unlinked object through the private
          // bucket's orphan-only delete policy; preserve the original error.
        }
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const retire = async (c: Certification) => {
    if (!window.confirm(`Remove "${c.cert_name} — ${c.holder}" from tracking?`)) return;
    const reason = window.prompt("Why is this certification being retired?")?.trim();
    if (!reason) return;
    try {
      await directRpc("retire_certification", {
        p_certification_id: c.id,
        p_reason: reason,
      }, "certs.retire");
      setCerts((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

  if (authLoading) {
    return <div className="gk-page mx-auto text-sm text-muted-foreground">Checking accessâ€¦</div>;
  }
  if (!canManage) {
    return (
      <div className="gk-page mx-auto">
        <h1>Certifications & Licenses</h1>
        <div role="alert" className="gk-card mt-4 p-4 text-sm text-muted-foreground">
          Qualification records are restricted to authorized management. Scoped employee and supervisor access remains enforced by the database.
        </div>
      </div>
    );
  }

  return (
    <div className="gk-page mx-auto">
      <h1 className="mb-1">Certifications & Licenses</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Food handler, cash handling, pesticide applicator — anything that
        expires warns on Today {CERT_LEAD_DAYS} days out.
      </p>

      {notice && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={openAdd}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all mb-5"
      >
        <Plus className="w-4 h-4" />
        Add certification
      </button>

      {showForm && (
        <div className="gk-card p-3 mb-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Linked staff member
            </label>
            <select
              value={fProfileId}
              onChange={(e) => {
                const profileId = e.target.value;
                setFProfileId(profileId);
                const person = staff.find((candidate) => candidate.id === profileId);
                if (person) setFHolder(person.display_name || person.full_name || "");
              }}
              className={inputCls}
            >
              <option value="">Not linked (external or legacy holder)</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.display_name || person.full_name || "Unnamed staff member"}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Link employees whenever possible so their qualification and protected evidence follow the employee/supervisor access rules.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Who holds it</label>
              <input value={fHolder} onChange={(e) => setFHolder(e.target.value)} placeholder="Name" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Certification</label>
              <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Food Handler" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">License #</label>
              <input value={fLicense} onChange={(e) => setFLicense(e.target.value)} placeholder="optional" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Issued</label>
              <input type="date" value={fIssued} onChange={(e) => setFIssued(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Expires</label>
              <input type="date" value={fExpires} onChange={(e) => setFExpires(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Card / license photo</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-muted-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
              <input value={fNotes} onChange={(e) => setFNotes(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !fHolder.trim() || !fName.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editing ? "Save changes" : "Add"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : evaluated.length === 0 ? (
        <div className="gk-card p-6 text-center text-sm text-muted-foreground">
          <Award className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Nothing tracked yet. Add the pesticide applicator license, food
          handler cards, cash handling certs — anything that can lapse.
        </div>
      ) : (
        <div className="gk-card divide-y divide-border/50">
          {evaluated.map(({ cert, status, daysUntil }) => {
            const badge = STATUS_BADGE[status];
            return (
              <div key={cert.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{cert.cert_name}</span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold px-1.5 py-0.5 rounded-md border",
                        badge.className,
                      )}
                    >
                      {badge.label(daysUntil)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {cert.holder}
                    {cert.license_number ? ` · #${cert.license_number}` : ""}
                    {cert.expires_date ? ` · expires ${cert.expires_date}` : ""}
                  </p>
                </div>
                {cert.document_path && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await openPrivateStorageFile(
                          cert.document_bucket || "photos",
                          cert.document_path!,
                        );
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Unable to open the protected file");
                      }
                    }}
                    className="inline-link p-1.5 rounded text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="View card"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => openEdit(cert)}
                  aria-label="Edit"
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => retire(cert)}
                  aria-label="Remove"
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
