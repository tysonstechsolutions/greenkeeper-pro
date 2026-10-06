"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, HelpCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ADMIN_ROLES, RoleGuard } from "@/components/auth/role-guard";
import { createClient } from "@/lib/supabase/client";
import { resolveAccessToken } from "@/lib/api/client";
import {
  checkConfig,
  checkEdgeFunctions,
  checkMigrations,
  type CheckState,
  type ConfigCheck,
  type FunctionCheck,
  type MigrationCheck,
} from "@/lib/system/health";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function StateIcon({ state }: { state: CheckState }) {
  if (state === "ok") return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-label="OK" />;
  if (state === "missing") return <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" aria-label="Needs attention" />;
  return <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" aria-label="Unknown" />;
}

function Section({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; state: CheckState; detail: string }[];
}) {
  const problems = rows.filter((r) => r.state !== "ok");
  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label={title}>
      <h2 className="text-sm font-semibold flex items-center justify-between">
        {title}
        <span className={`text-xs font-medium ${problems.length ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
          {problems.length ? `${problems.length} need${problems.length === 1 ? "s" : ""} attention` : "All good"}
        </span>
      </h2>
      <ul className="mt-3 space-y-2">
        {/* Problems first, so nothing gets missed in a long list. */}
        {[...problems, ...rows.filter((r) => r.state === "ok")].map((r) => (
          <li key={r.key} className="flex items-start gap-2 text-sm">
            <StateIcon state={r.state} />
            <span className="min-w-0">
              <span className="font-medium">{r.label}</span>
              <span className={`block text-xs ${r.state === "ok" ? "text-muted-foreground" : "text-red-700 dark:text-red-400"}`}>
                {r.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SystemHealth() {
  const [functions, setFunctions] = useState<FunctionCheck[] | null>(null);
  const [migrations, setMigrations] = useState<MigrationCheck[] | null>(null);
  const [config] = useState<ConfigCheck[]>(() =>
    checkConfig({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_WEATHER_API_KEY: process.env.NEXT_PUBLIC_WEATHER_API_KEY,
    }),
  );
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const token = await resolveAccessToken(createClient(), SUPABASE_URL, ANON_KEY).catch(() => null);
      const [fns, migs] = await Promise.all([
        checkEdgeFunctions(SUPABASE_URL, ANON_KEY, token),
        checkMigrations().catch(() => []),
      ]);
      setFunctions(fns);
      setMigrations(migs);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto space-y-4">
      <PageHeader title="System Health" description="Is everything the app needs switched on?" icon={Activity} />
      <Button variant="outline" className="gap-2" onClick={() => void run()} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Check again
      </Button>

      {migrations === null || functions === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking…
        </div>
      ) : (
        <>
          <Section
            title="Database updates"
            rows={migrations.map((m) => ({ key: m.name, label: `${m.what} (${m.name})`, state: m.state, detail: m.detail }))}
          />
          <Section
            title="AI and server features"
            rows={functions.map((f) => ({ key: f.name, label: f.label, state: f.state, detail: f.detail }))}
          />
          <Section
            title="App settings"
            rows={config.map((c) => ({ key: c.label, label: c.label, state: c.state, detail: c.detail }))}
          />
        </>
      )}
    </div>
  );
}

export default function SystemHealthPage() {
  return (
    <RoleGuard allowedRoles={ADMIN_ROLES}>
      <SystemHealth />
    </RoleGuard>
  );
}
