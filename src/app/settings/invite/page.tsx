"use client";

// The old email-based invite flow has been retired. Managers add staff
// manually from the /staff page (see AddStaffSheet). This page exists
// only to redirect any stale bookmarks/links to the new home.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function InviteRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Hard navigation so the staff page boots fresh — keeps the back-stack
    // tidy and avoids any stale state from the legacy invite UI.
    router.replace("/staff");
  }, [router]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin" />
      <p className="text-sm">Redirecting to Staff…</p>
    </div>
  );
}
