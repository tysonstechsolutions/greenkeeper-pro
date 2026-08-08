"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock, Sun, Moon, ChevronRight, UserPlus, Loader2, CheckCircle, AlertCircle,
  Sprout, UtensilsCrossed, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProShopStaff, ShiftGroup } from "@/lib/pro-shop/types";
import { directSelectList } from "@/lib/supabase/rest";
import { positionGroup } from "@/lib/pro-shop/types";
import {
  findUnimportedScheduleStaff,
  importScheduleStaff,
} from "@/lib/staff/import-schedule-staff";

/** The icon each job wears on its name chip, for every schedule. */
const JOB_CHIP: Record<ShiftGroup, { icon: typeof Sun; tint: string }> = {
  inside: { icon: Moon, tint: "text-indigo-500" },
  outside: { icon: Sun, tint: "text-amber-500" },
  grounds: { icon: Sprout, tint: "text-emerald-600" },
  shop: { icon: Wrench, tint: "text-violet-500" },
  restaurant: { icon: UtensilsCrossed, tint: "text-rose-500" },
};

interface ProShopRosterCardProps {
  /** Names of existing profiles, for spotting schedule staff not yet in Staff. */
  profileNames?: { full_name: string | null }[];
  /** Called after schedule staff were imported so the parent can refetch. */
  onImported?: () => void;
}

/**
 * "Pro Shop & Golf Ops" roster card for the main /staff page. These people are
 * scheduled from their own lightweight table; anyone not yet in the real staff
 * system can be added from here in one tap (so they're selectable on SF-52s).
 */
export function ProShopRosterCard({ profileNames, onImported }: ProShopRosterCardProps) {
  const [staff, setStaff] = useState<ProShopStaff[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    directSelectList<ProShopStaff>("pro_shop_staff", {
      columns: "id,full_name,position,default_group,availability_text,availability,flex,phone,is_active,sort_order,notes",
      filters: ["is_active=eq.true"],
      orderBy: [{ column: "sort_order", ascending: true }],
      label: "staff.proshop.roster",
    })
      .then((rows) => {
        if (alive) {
          setStaff(rows);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const missing = useMemo(
    () => (profileNames ? findUnimportedScheduleStaff(staff, profileNames) : []),
    [staff, profileNames],
  );

  const handleImport = useCallback(async () => {
    if (importing || missing.length === 0) return;
    setImporting(true);
    setNotice(null);
    try {
      const result = await importScheduleStaff(missing);
      if (result.failed.length === 0) {
        setNotice({ kind: "ok", text: `Added ${result.added.length} to Staff — they can now be picked on SF-52s.` });
      } else {
        const failedNames = result.failed.map((f) => f.name).join(", ");
        setNotice({
          kind: "error",
          text: `Added ${result.added.length}; failed: ${failedNames} (${result.failed[0].error})`,
        });
      }
      if (result.added.length > 0) onImported?.();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Import failed." });
    } finally {
      setImporting(false);
    }
  }, [importing, missing, onImported]);

  if (loaded && staff.length === 0) return null;

  const missingNames = new Set(missing.map((m) => m.id));

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-6">
      <Link href="/pro-shop-schedule" className="block hover:opacity-80 transition-opacity">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            Pro Shop &amp; Golf Ops
            <span className="text-xs font-normal text-muted-foreground">({staff.length})</span>
          </h2>
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            Schedule <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {staff.map((s) => (
            <span
              key={s.id}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-background ${
                missingNames.has(s.id) ? "border-amber-400/60 border-dashed" : "border-border"
              }`}
            >
              {(() => {
                const { icon: Icon, tint } = JOB_CHIP[positionGroup(s.position)];
                return <Icon className={`w-3 h-3 ${tint}`} />;
              })()}
              {s.full_name}
            </span>
          ))}
        </div>
      </Link>

      {missing.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="text-xs text-muted-foreground flex-1">
            {missing.length} on the schedule {missing.length === 1 ? "isn't" : "aren't"} in Staff yet
            (dashed) — add them so they can be picked on SF-52s.
          </p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleImport} disabled={importing}>
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            {importing ? "Adding…" : `Add ${missing.length} to Staff`}
          </Button>
        </div>
      )}
      {notice && (
        <p
          className={`mt-2 text-xs flex items-start gap-1.5 ${
            notice.kind === "ok" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
          }`}
        >
          {notice.kind === "ok" ? (
            <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          )}
          {notice.text}
        </p>
      )}
    </div>
  );
}
