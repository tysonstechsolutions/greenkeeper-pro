"use client";

import { useCallback, useMemo } from "react";
import { LeadershipBriefingReview } from "@/components/briefing/leadership-briefing-review";
import {
  exportApprovedBriefing,
  saveApprovedBriefing,
} from "@/lib/briefing/approved-document";
import { loadLeadershipBriefing } from "@/lib/briefing/load";
import { RoleGuard, GM_ROLES } from "@/components/auth/role-guard";
import { todayLocal } from "@/lib/utils/date";

function LeadershipBriefingPageContent() {
  // Keep the reporting "as of" date stable for this preview session. The
  // review component provides only cadence and anchor; all facts still come
  // from the existing deterministic buildBriefing() call in the loader.
  const asOf = useMemo(() => todayLocal(), []);

  const load = useCallback(
    (selection: { kind: "monthly" | "quarterly"; anchor: string }) =>
      loadLeadershipBriefing({
        asOf,
        generatedAt: new Date().toISOString(),
        period: selection,
      }),
    [asOf],
  );

  const exportPdf = useCallback(
    async (
      briefing: Awaited<ReturnType<typeof loadLeadershipBriefing>>,
      approved: boolean,
    ) => {
      await exportApprovedBriefing(briefing, approved);
    },
    [],
  );

  const savePdf = useCallback(
    async (
      briefing: Awaited<ReturnType<typeof loadLeadershipBriefing>>,
      approved: boolean,
    ) => {
      await saveApprovedBriefing(briefing, approved);
    },
    [],
  );

  return (
    <LeadershipBriefingReview
      initialAnchor={asOf}
      loadBriefing={load}
      onExport={exportPdf}
      onSave={savePdf}
    />
  );
}

export default function LeadershipBriefingPage() {
  return (
    <RoleGuard allowedRoles={GM_ROLES}>
      <LeadershipBriefingPageContent />
    </RoleGuard>
  );
}
