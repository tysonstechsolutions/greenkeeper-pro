"use client";

// The standalone "New Work Order" page was merged into /work-orders (form +
// history on one page). This route now just redirects there so old links and
// bookmarks keep working.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WorkOrderRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/work-orders");
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
      Redirecting to Work Orders…
    </div>
  );
}
