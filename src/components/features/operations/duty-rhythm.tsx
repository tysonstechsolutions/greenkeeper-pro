import Link from "next/link";
import { Check, UserRoundCog } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DUTY_ROLE_GROUP_LABELS,
  DUTY_ROLE_GROUP_ORDER,
} from "@/lib/operations/duties";
import type { DutyRoleGroup, DutyTodayItem } from "@/lib/operations/types";

function legacyRoleGroup(item: DutyTodayItem): DutyRoleGroup {
  if (item.duty.role_group) return item.duty.role_group;
  if (item.duty.area === "course") return "maintenance_staff";
  if (item.duty.area === "restaurant") return "restaurant_staff";
  if (item.duty.area === "pro_shop") return "pro_shop_staff";
  return "unassigned";
}

function displayGroup(item: DutyTodayItem): DutyRoleGroup {
  if (!item.primaryName && !item.contractorName) return "unassigned";
  return legacyRoleGroup(item);
}

export function DutyRhythm({
  items,
  onToggle,
}: {
  items: DutyTodayItem[];
  onToggle: (dutyId: string, done: boolean) => void;
}) {
  const grouped = new Map<DutyRoleGroup, DutyTodayItem[]>();
  for (const item of items) {
    const group = displayGroup(item);
    grouped.set(group, [...(grouped.get(group) ?? []), item]);
  }

  if (items.length === 0) return null;

  return (
    <section className="mb-6 gk-animate-in gk-animate-in-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="gk-section-label">The day&apos;s delegated rhythm</p>
        <Link href="/operations/duties" className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          <UserRoundCog className="h-3.5 w-3.5" />Manage duties
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {DUTY_ROLE_GROUP_ORDER.map((group) => {
          const duties = grouped.get(group);
          if (!duties?.length) return null;
          const doneCount = duties.filter((item) => item.done).length;
          return (
            <div key={group} className="gk-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2.5">
                <span className="text-xs font-semibold">{DUTY_ROLE_GROUP_LABELS[group]}</span>
                <span className="text-[11px] text-muted-foreground">{doneCount}/{duties.length}</span>
              </div>
              <div className="divide-y divide-border/50">
                {duties.map((item) => {
                  const owner = item.primaryName ?? item.contractorName ?? "Unassigned";
                  const target = legacyRoleGroup(item);
                  const verified = item.occurrence?.status === "verified";
                  return (
                    <button
                      key={item.duty.id}
                      type="button"
                      onClick={() => onToggle(item.duty.id, !item.done)}
                      disabled={verified}
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/40 active:bg-muted/60 disabled:cursor-default disabled:opacity-80"
                      aria-label={`${verified ? "Verified" : item.done ? "Reopen" : "Complete"} ${item.duty.title}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          item.done ? "border-primary bg-primary text-primary-foreground" : "border-input",
                        )}>
                          {item.done && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-sm font-medium leading-snug", item.done && "line-through text-muted-foreground")}>{item.duty.title}</span>
                          <span className={cn("mt-1 block text-xs", owner === "Unassigned" ? "font-medium text-warning-foreground" : "text-muted-foreground")}>
                            {owner}
                            {item.duty.estimated_minutes == null ? " · Duration not recorded" : ` · ${item.duty.estimated_minutes} min`}
                          </span>
                          {group === "unassigned" && target !== "unassigned" && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">Target group: {DUTY_ROLE_GROUP_LABELS[target]}</span>
                          )}
                          {item.backupName && <span className="mt-0.5 block text-xs text-muted-foreground">Backup: {item.backupName}</span>}
                          {item.duty.instructions && <span className="mt-1 block text-xs text-muted-foreground">{item.duty.instructions}</span>}
                          {item.duty.evidence_requirements?.length ? <span className="mt-0.5 block text-xs text-muted-foreground">Evidence: {item.duty.evidence_requirements.join(", ")}</span> : null}
                          {item.duty.manager_verification_required && <span className="mt-0.5 block text-xs font-medium text-primary">Manager verification required</span>}
                          {verified && <span className="mt-0.5 block text-xs font-medium text-primary">Verified by manager</span>}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
