"use client";

// SF-52 Files: file each employee's signed SF-52s. A resignation or transfer
// SF-52 takes the person off the evaluation lists; any other action is just
// kept on their profile (Documents).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ExternalLink, FileUp, Loader2, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_ROLES, RoleGuard, withFbManager } from "@/components/auth/role-guard";
import { useAuth } from "@/lib/hooks/useAuth";
import { roleLabels } from "@/lib/hooks/useProfiles";
import { staffForViewer } from "@/lib/auth/fb-manager";
import { DUTY_DEPARTMENT_LABELS } from "@/lib/operations/duties";
import { directSelectList, getCachedUserId } from "@/lib/supabase/rest";
import {
  SF52_ACTION_LABELS,
  deleteSf52File,
  loadSf52Files,
  removesFromEvaluations,
  sf52ActionOf,
  sf52FileUrl,
  uploadSf52File,
  type Sf52Action,
  type Sf52File,
} from "@/lib/staff/sf52-files";
import type { UserRole } from "@/types/database";

interface Person {
  id: string;
  full_name: string | null;
  role: UserRole;
  department: string | null;
  is_active: boolean | null;
}

const ACTIONS: Sf52Action[] = ["resignation", "transfer", "other"];

function shortDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function UploadPanel({
  person,
  onDone,
  onCancel,
}: {
  person: Person;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState<Sf52Action | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = person.full_name || "Employee";

  const save = async () => {
    if (!action || !file) return;
    setSaving(true);
    setError(null);
    try {
      await uploadSf52File(person.id, action, file);
      onDone(
        removesFromEvaluations(action)
          ? `Filed ${name}'s ${SF52_ACTION_LABELS[action].toLowerCase()} SF-52. ${name} is off the evaluation lists.`
          : `Filed ${name}'s SF-52.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload the SF-52.");
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-3" aria-label={`Upload SF-52 for ${name}`}>
      <fieldset>
        <legend className="text-sm font-medium mb-1.5">What is this SF-52 for?</legend>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <label
              key={a}
              className={`px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                action === a ? "border-[#1B4332] bg-[#1B4332]/5 font-medium dark:border-emerald-400" : "border-border bg-background"
              }`}
            >
              <input type="radio" name={`action-${person.id}`} value={a} checked={action === a} onChange={() => setAction(a)} className="sr-only" />
              {SF52_ACTION_LABELS[a]}
            </label>
          ))}
        </div>
        {action && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {removesFromEvaluations(action)
              ? `${name} comes off the year-end and 90-day evaluation lists.`
              : "Kept on their profile. It doesn't change the evaluation lists."}
          </p>
        )}
      </fieldset>
      <label className="block">
        <span className="text-sm font-medium">Signed SF-52 (PDF or photo)</span>
        <input
          type="file"
          accept="application/pdf,image/*"
          aria-label={`SF-52 file for ${name}`}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-muted file:text-sm"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={save} disabled={!action || !file || saving} className="gap-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
          {saving ? "Uploading…" : "Upload"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Sf52FilesContent() {
  const { profile: me } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [files, setFiles] = useState<Sf52File[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profiles, sf52] = await Promise.all([
        directSelectList<Person>("profiles", {
          columns: "id,full_name,role,department,is_active",
          filters: ["is_active=eq.true"],
          orderBy: [{ column: "full_name", ascending: true }],
          label: "sf52Files.people",
        }),
        loadSf52Files(),
      ]);
      const myId = me?.id ?? getCachedUserId();
      setPeople(staffForViewer(me?.role, myId, profiles).filter((p) => p.id !== myId));
      setFiles(sf52);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the SF-52s.");
    } finally {
      setLoading(false);
    }
  }, [me?.id, me?.role]);

  useEffect(() => {
    load();
  }, [load]);

  const byPerson = useMemo(() => {
    const m = new Map<string, Sf52File[]>();
    for (const f of files) m.set(f.employee_id, [...(m.get(f.employee_id) ?? []), f]);
    return m;
  }, [files]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => (p.full_name ?? "").toLowerCase().includes(q)) : people;
  }, [people, query]);

  const leaving = people.filter((p) => (byPerson.get(p.id) ?? []).some((f) => removesFromEvaluations(sf52ActionOf(f.category))));

  const open = async (f: Sf52File) => {
    setBusy(f.id);
    try {
      window.open(await sf52FileUrl(f), "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the SF-52.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (f: Sf52File, name: string) => {
    if (!window.confirm(`Remove this SF-52 from ${name}'s file?`)) return;
    setBusy(f.id);
    try {
      await deleteSf52File(f);
      setNotice(`Removed the SF-52 from ${name}'s file.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the SF-52.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload each person&apos;s signed SF-52. A <b>resignation</b> or <b>transfer</b> SF-52 takes them off the{" "}
        <Link href="/staff/evaluations/" className="underline">
          evaluation lists
        </Link>
        . Any other SF-52 is kept on their profile under Documents.
      </p>

      {notice && (
        <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <label className="relative block">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find an employee"
          aria-label="Find an employee"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-base"
        />
      </label>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {people.length} employees · {leaving.length} leaving (resignation or transfer SF-52 on file)
          </p>
          <ul className="space-y-2" aria-label="Employees">
            {shown.map((p) => {
              const name = p.full_name || "Employee";
              const mine = byPerson.get(p.id) ?? [];
              return (
                <li key={p.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {roleLabels[p.role] ?? p.role}
                        {p.department ? ` · ${(DUTY_DEPARTMENT_LABELS as Record<string, string>)[p.department] ?? p.department}` : ""}
                      </p>
                    </div>
                    {openFor !== p.id && (
                      <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setOpenFor(p.id)}>
                        <FileUp className="w-4 h-4" />
                        Upload SF-52
                      </Button>
                    )}
                  </div>
                  {mine.length > 0 && (
                    <ul className="mt-2 space-y-1" aria-label={`${name}'s SF-52s`}>
                      {mine.map((f) => {
                        const action = sf52ActionOf(f.category);
                        const leavingAction = removesFromEvaluations(action);
                        return (
                          <li key={f.id} className="flex items-center gap-2 text-sm">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                leavingAction ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {action ? SF52_ACTION_LABELS[action] : "SF-52"}
                            </span>
                            <span className="text-xs text-muted-foreground">filed {shortDate(f.created_at)}</span>
                            {leavingAction && <span className="text-xs text-muted-foreground">· off the evaluation lists</span>}
                            <span className="ml-auto flex gap-1">
                              <button
                                onClick={() => open(f)}
                                disabled={busy === f.id}
                                className="p-1.5 rounded hover:bg-muted"
                                aria-label={`Open ${name}'s SF-52 from ${shortDate(f.created_at)}`}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => remove(f, name)}
                                disabled={busy === f.id}
                                className="p-1.5 rounded hover:bg-muted text-destructive"
                                aria-label={`Remove ${name}'s SF-52 from ${shortDate(f.created_at)}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {openFor === p.id && (
                    <UploadPanel
                      person={p}
                      onCancel={() => setOpenFor(null)}
                      onDone={async (message) => {
                        setOpenFor(null);
                        setNotice(message);
                        await load();
                      }}
                    />
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className="text-sm text-muted-foreground p-4 text-center">No one matches.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

export default function Sf52FilesPage() {
  return (
    <RoleGuard allowedRoles={withFbManager(ADMIN_ROLES)}>
      <div className="p-4 md:p-6 pb-24 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-3">SF-52 Files</h1>
        <Sf52FilesContent />
      </div>
    </RoleGuard>
  );
}
