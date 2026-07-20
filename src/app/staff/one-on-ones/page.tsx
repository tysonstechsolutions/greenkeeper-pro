"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MessageSquareHeart,
  TrendingUp,
  Loader2,
  Sparkles,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MANAGEMENT_ROLES, RoleGuard } from "@/components/auth/role-guard";
import { directSelectList } from "@/lib/supabase/rest";
import { roleLabels, getInitials } from "@/lib/hooks/useProfiles";
import { TEMPLATE_LABELS } from "@/lib/oneonone/types";
import type { OneOnOneSession, OneOnOneTemplate } from "@/lib/oneonone/types";
import type { UserRole } from "@/types/database";

interface ProfileLite {
  id: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean | null;
}

interface LastSession {
  date: string;
  template: OneOnOneTemplate;
}

/** Days between an ISO date (date-only) and today. */
function daysSince(iso: string): number {
  const then = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}

function fmtDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function OneOnOnesLauncher() {
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [lastByEmployee, setLastByEmployee] = useState<Map<string, LastSession>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profs, sess] = await Promise.all([
          directSelectList<ProfileLite>("profiles", {
            columns: "id,full_name,role,is_active",
            orderBy: [{ column: "full_name", ascending: true }],
            label: "oneonones.profiles",
          }),
          directSelectList<OneOnOneSession>("staff_one_on_one_sessions", {
            filters: ["status=eq.completed"],
            orderBy: [{ column: "session_date", ascending: false }],
            label: "oneonones.sessions",
          }),
        ]);
        if (cancelled) return;
        // Sessions arrive newest-first, so the first one seen per employee is
        // their most recent 1:1.
        const last = new Map<string, LastSession>();
        for (const s of sess) {
          if (!last.has(s.employee_id)) {
            last.set(s.employee_id, {
              date: s.session_date,
              template: s.template,
            });
          }
        }
        setProfiles(profs);
        setLastByEmployee(last);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load staff.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Active staff only, sorted most-overdue first (never-had at the very top),
  // so whoever needs a 1:1 most rises to the top of the list.
  const roster = useMemo(() => {
    return profiles
      .filter((p) => p.is_active !== false)
      .map((p) => ({ profile: p, last: lastByEmployee.get(p.id) ?? null }))
      .sort((a, b) => {
        const da = a.last ? daysSince(a.last.date) : Number.POSITIVE_INFINITY;
        const db = b.last ? daysSince(b.last.date) : Number.POSITIVE_INFINITY;
        return db - da;
      });
  }, [profiles, lastByEmployee]);

  return (
    <div className="p-4 md:p-6 pb-24 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareHeart className="w-6 h-6 text-[#1B4332] dark:text-emerald-400" />
            1:1s
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Pick someone and start a 1:1 — no digging through profiles.
          </p>
        </div>
        <Link href="/staff/insights">
          <Button variant="outline" className="gap-2 shrink-0">
            <TrendingUp className="w-4 h-4" />
            1:1 Insights
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted/60 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      ) : roster.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground border border-border rounded-lg">
          No active staff to run 1:1s with yet.
        </div>
      ) : (
        <div className="space-y-2">
          {roster.map(({ profile, last }) => {
            const overdue = !last || daysSince(last.date) >= 30;
            return (
              <Link
                key={profile.id}
                href={`/staff/profile?id=${profile.id}&tab=oneonone`}
                className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
              >
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-[#1B4332]/10 text-[#1B4332] dark:bg-emerald-400/10 dark:text-emerald-400 flex items-center justify-center font-semibold shrink-0">
                  {getInitials(profile.full_name)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {profile.full_name || "Employee"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>{roleLabels[profile.role]}</span>
                    <span aria-hidden>·</span>
                    {last ? (
                      <span
                        className={
                          overdue
                            ? "flex items-center gap-1 text-amber-600 dark:text-amber-400"
                            : "flex items-center gap-1"
                        }
                      >
                        <Clock className="w-3 h-3" />
                        Last: {TEMPLATE_LABELS[last.template]} · {fmtDate(last.date)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Clock className="w-3 h-3" />
                        No 1:1 yet
                      </span>
                    )}
                  </div>
                </div>

                {/* Action */}
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-[#1B4332] px-3 py-1.5 text-sm font-medium text-white shrink-0">
                  <Sparkles className="w-4 h-4" />
                  Start 1:1
                </span>
                <ChevronRight className="w-5 h-5 text-muted-foreground sm:hidden shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OneOnOnesPage() {
  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
      <OneOnOnesLauncher />
    </RoleGuard>
  );
}
