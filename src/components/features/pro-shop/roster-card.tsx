"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Sun, Moon, ChevronRight } from "lucide-react";
import { directSelectList } from "@/lib/supabase/rest";
import type { ProShopStaff } from "@/lib/pro-shop/types";
import { positionGroup } from "@/lib/pro-shop/types";

/**
 * Read-only "Pro Shop & Golf Ops" roster card for the main /staff page. These
 * people live in their own lightweight table (no logins); this surfaces them in
 * the staff roster and links into the scheduler.
 */
export function ProShopRosterCard() {
  const [staff, setStaff] = useState<ProShopStaff[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    directSelectList<ProShopStaff>("pro_shop_staff", {
      columns: "id,full_name,position,is_active,sort_order",
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

  if (loaded && staff.length === 0) return null;

  return (
    <Link
      href="/pro-shop-schedule"
      className="block rounded-xl border border-border bg-card hover:bg-muted/40 p-4 mb-6 transition-colors"
    >
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
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-border bg-background"
          >
            {positionGroup(s.position) === "inside" ? (
              <Moon className="w-3 h-3 text-indigo-500" />
            ) : (
              <Sun className="w-3 h-3 text-amber-500" />
            )}
            {s.full_name}
          </span>
        ))}
      </div>
    </Link>
  );
}
