/**
 * System Health: is everything the app needs actually switched on?
 *
 *  - Edge functions (AI and server features) are deployed by hand or by the
 *    deploy workflow; a missing one only shows up when someone uses it. Each
 *    is probed with a plain GET, which every function rejects (405) or
 *    answers harmlessly before doing any work; 404 means "not deployed".
 *  - Database updates (migrations) are run by hand in the SQL editor. Newer
 *    migrations record themselves in public.app_migrations; older ones are
 *    checked by a read-only probe of something they created.
 */
import { createClient } from "@/lib/supabase/client";

/** Every edge function in supabase/functions (a test keeps this in sync). */
export const EDGE_FUNCTIONS: string[] = [
  "ai-assistant",
  "audit-pr-fit",
  "bulk-tasks",
  "daily-briefing",
  "dd-forms-ai",
  "drone-upload",
  "extract-889",
  "extract-pr",
  "extract-quote",
  "extract-receipt",
  "extract-revenue",
  "extract-staff-doc",
  "financial-advisor",
  "fix-instructions",
  "get-weather",
  "green-fix-instructions",
  "morning-route",
  "one-on-one-digest",
  "one-on-one-questions",
  "one-on-one-report",
  "pin-login",
  "pin-signup",
  "pro-shop-ai",
  "push-send",
  "push-subscribe",
  "spray-window",
  "staff-evaluation-draft",
  "task-breakdown",
  "task-directions",
  "translate",
];

/** Human names for the functions people actually notice. */
export const EDGE_FUNCTION_LABELS: Record<string, string> = {
  "ai-assistant": "AI Assistant",
  "audit-pr-fit": "PR Audit cost-center check",
  "bulk-tasks": "Bulk task creation",
  "daily-briefing": "Morning briefing (scheduled)",
  "dd-forms-ai": "DD forms AI",
  "drone-upload": "Drone uploads",
  "extract-889": "Read 889 forms",
  "extract-pr": "Read PR documents",
  "extract-quote": "Read vendor quotes",
  "extract-receipt": "Read receipts",
  "extract-revenue": "Read revenue reports",
  "extract-staff-doc": "Read staff documents",
  "financial-advisor": "Financial advisor",
  "fix-instructions": "Fix instructions",
  "get-weather": "Weather",
  "green-fix-instructions": "Green fix instructions",
  "morning-route": "Morning route",
  "one-on-one-digest": "1:1 digest",
  "one-on-one-questions": "1:1 questions",
  "one-on-one-report": "1:1 report",
  "pin-login": "PIN sign-in",
  "pin-signup": "PIN sign-up (Add Staff)",
  "pro-shop-ai": "Pro shop schedule AI",
  "push-send": "Push notifications (send)",
  "push-subscribe": "Push notifications (subscribe)",
  "spray-window": "Spray window",
  "staff-evaluation-draft": "Evaluation AI draft",
  "task-breakdown": "Task breakdown",
  "task-directions": "Task directions",
  translate: "Translate (Spanish)",
};

export type CheckState = "ok" | "missing" | "unknown";

export interface FunctionCheck {
  name: string;
  label: string;
  state: CheckState;
  detail: string;
}

/** 404 from the functions gateway means the function was never deployed. */
export function functionStateFromStatus(status: number | null): CheckState {
  if (status === null) return "unknown";
  if (status === 404) return "missing";
  return "ok";
}

export async function checkEdgeFunctions(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<FunctionCheck[]> {
  return Promise.all(
    EDGE_FUNCTIONS.map(async (name) => {
      let status: number | null = null;
      try {
        const res = await fetchImpl(`${supabaseUrl}/functions/v1/${name}`, {
          method: "GET",
          headers: { apikey: anonKey, Authorization: `Bearer ${accessToken ?? anonKey}` },
        });
        status = res.status;
      } catch {
        status = null;
      }
      const state = functionStateFromStatus(status);
      return {
        name,
        label: EDGE_FUNCTION_LABELS[name] ?? name,
        state,
        detail:
          state === "ok"
            ? "Deployed"
            : state === "missing"
              ? `Not deployed. Push to main (auto-deploy) or run: supabase functions deploy ${name}`
              : "Couldn't reach it (offline?)",
      };
    }),
  );
}

/** Migrations that record themselves in app_migrations when run. */
export const TRACKED_MIGRATIONS: { name: string; what: string }[] = [
  {
    name: "20261006120000_operations_upgrade",
    what: "Food cost and US Foods invoices, evaluation follow-through, Buckley's-only schedule for the F&B Manager",
  },
  {
    name: "20261007120000_bar_and_invoice_coding",
    what: "Buckley's bar kept apart from the restaurant (Bar sales, bar items on invoices) and cost center / G/L on every invoice line",
  },
  {
    name: "20261008120000_inventory_valuations",
    what: "Month-end inventory counts (food, bar, pro shop retail) for true cost of goods",
  },
  {
    name: "20261009120000_sales_reports",
    what: "RecTrac sales reports item by item (daily sales, best sellers, prices)",
  },
  {
    name: "20261012120000_sap_budget_reports",
    what: "SAP budget reports (official profit and loss by cost center, budget vs actual)",
  },
  {
    name: "20261013120000_gm_manages_pins",
    what: "The GM can see, set, and reset everyone's sign-in PIN",
  },
];

/** Older migrations, checked by calling something they created (read-only). */
export const PROBED_MIGRATIONS: { name: string; what: string; rpc: string; args: Record<string, unknown> }[] = [
  {
    name: "20261005140000_fb_manager_role",
    what: "F&B Manager role",
    rpc: "is_fb_manager",
    args: {},
  },
];

export interface MigrationCheck {
  name: string;
  what: string;
  state: CheckState;
  detail: string;
}

export async function checkMigrations(): Promise<MigrationCheck[]> {
  const supabase = createClient();
  const results: MigrationCheck[] = [];

  const { data, error } = await supabase.from("app_migrations").select("name");
  const applied = new Set(((data as { name: string }[] | null) ?? []).map((r) => r.name));
  for (const m of TRACKED_MIGRATIONS) {
    const state: CheckState = error && !/app_migrations|relation|schema cache/i.test(error.message)
      ? "unknown"
      : applied.has(m.name)
        ? "ok"
        : "missing";
    results.push({
      ...m,
      state,
      detail:
        state === "ok"
          ? "Applied"
          : state === "missing"
            ? `Not run yet. Run supabase/migrations/${m.name}.sql in the Supabase SQL editor.`
            : "Couldn't check",
    });
  }

  for (const m of PROBED_MIGRATIONS) {
    const { error: rpcError } = await supabase.rpc(m.rpc, m.args);
    const missing = !!rpcError && /could not find the function|PGRST202/i.test(`${rpcError.message} ${rpcError.code}`);
    const state: CheckState = !rpcError ? "ok" : missing ? "missing" : "unknown";
    results.push({
      name: m.name,
      what: m.what,
      state,
      detail:
        state === "ok"
          ? "Applied"
          : state === "missing"
            ? `Not run yet. Run supabase/migrations/${m.name}.sql in the Supabase SQL editor.`
            : "Couldn't check",
    });
  }
  return results;
}

export interface ConfigCheck {
  label: string;
  state: CheckState;
  detail: string;
}

/** Settings baked into the web build. */
export function checkConfig(env: Record<string, string | undefined>): ConfigCheck[] {
  const has = (k: string) => !!(env[k] ?? "").trim();
  return [
    {
      label: "Supabase connection",
      state: has("NEXT_PUBLIC_SUPABASE_URL") && has("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "ok" : "missing",
      detail: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    },
    {
      label: "Weather",
      state: has("NEXT_PUBLIC_WEATHER_API_KEY") ? "ok" : "missing",
      detail: "NEXT_PUBLIC_WEATHER_API_KEY (set in Vercel)",
    },
  ];
}
