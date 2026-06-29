"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  FileText,
  Wallet,
  BarChart3,
  FileSpreadsheet,
  Building2,
  Trophy,
  Store,
  HardHat,
  Landmark,
  ClipboardCheck,
  Users,
  FilePlus,
  GraduationCap,
} from "lucide-react";

/**
 * General Manager home. Business/admin counterpart to the Superintendent
 * dashboard. Reads the SAME data as the rest of the app (one shared
 * database) — it just surfaces the budget / purchasing / reporting side.
 */
export default function GmDashboardPage() {
  const [pending, setPending] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      try {
        const { count: pend } = await supabase
          .from("purchase_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "sent"]);
        const { count: act } = await supabase
          .from("purchase_requests")
          .select("id", { count: "exact", head: true })
          .neq("status", "draft");
        setPending(pend ?? 0);
        setActive(act ?? 0);
      } catch {
        setPending(null);
        setActive(null);
      }
    })();
  }, []);

  const tools = [
    { href: "/budget", label: "Budget", icon: Wallet },
    { href: "/purchase-requests", label: "Purchase Requests", icon: FileText },
    { href: "/pr-audit", label: "PR Audit", icon: ClipboardCheck },
    { href: "/revenue", label: "Revenue", icon: Landmark },
    { href: "/vendors", label: "Vendors", icon: Store },
    { href: "/tournaments", label: "Tournaments", icon: Trophy },
    { href: "/clubhouse", label: "Clubhouse", icon: Building2 },
    { href: "/capital-projects", label: "Capital Projects", icon: HardHat },
    { href: "/sole-source", label: "Sole Source", icon: FileSpreadsheet },
    { href: "/sow", label: "SOW", icon: FileSpreadsheet },
    { href: "/staff", label: "Staff", icon: Users },
    { href: "/onboarding", label: "Onboarding & SOPs", icon: GraduationCap },
  ];

  return (
    <div className="gk-page mx-auto">
      <div className="mb-5">
        <p className="gk-section-label">General Manager</p>
        <h1 className="mt-1">Operations overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Budget, purchasing, and reporting at a glance.
        </p>
      </div>

      {/* Live purchase-request stats */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Link href="/purchase-requests" className="gk-card p-4 block">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <FileText className="w-4 h-4" />
            <span className="text-xs font-medium">Awaiting approval</span>
          </div>
          <p className="text-3xl font-bold text-foreground leading-none">
            {pending ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">purchase requests</p>
        </Link>
        <Link href="/purchase-requests" className="gk-card p-4 block">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <ClipboardCheck className="w-4 h-4" />
            <span className="text-xs font-medium">Active PRs</span>
          </div>
          <p className="text-3xl font-bold text-foreground leading-none">
            {active ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">in progress</p>
        </Link>
      </div>

      {/* Primary actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link
          href="/purchase-requests/new"
          className="gk-card p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FilePlus className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Create PR</p>
            <p className="text-xs text-muted-foreground truncate">
              New purchase request
            </p>
          </div>
        </Link>
        <Link
          href="/reports/monthly-board"
          className="gk-card p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Board Report</p>
            <p className="text-xs text-muted-foreground truncate">Monthly packet</p>
          </div>
        </Link>
      </div>

      {/* Toolbox */}
      <p className="gk-section-label mb-2">GM toolbox</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tools.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="gk-card p-4 flex flex-col items-start gap-2"
          >
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <t.icon className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm font-medium leading-tight">{t.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
