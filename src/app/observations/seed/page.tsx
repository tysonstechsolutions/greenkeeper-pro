"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SeedObservationsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ inserted?: number; errors?: { title: string; error: string }[] } | null>(null);

  const handleSeed = async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/seed-observations", { method: "POST" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to seed");

      setResult(data);
      setStatus("success");

      // Redirect to observations page after 2 seconds
      setTimeout(() => router.push("/observations"), 2000);
    } catch (err) {
      setResult({ errors: [{ title: "Request", error: err instanceof Error ? err.message : "Unknown error" }] });
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 max-w-lg mx-auto text-center">
      <h1 className="text-2xl font-bold mb-2">Seed Course Observations</h1>
      <p className="text-muted-foreground mb-6">
        This will add 11 observations from your initial course walk-through (parking lot, signage, greens, geese, fairways, etc.)
      </p>

      {status === "idle" && (
        <Button size="lg" onClick={handleSeed} className="gap-2">
          Add All Observations
        </Button>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Adding observations...
        </div>
      )}

      {status === "success" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="w-5 h-5" />
            Added {result?.inserted} observations successfully!
          </div>
          <p className="text-sm text-muted-foreground">Redirecting to observations...</p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            Something went wrong
          </div>
          {result?.errors?.map((e, i) => (
            <p key={i} className="text-sm text-muted-foreground">{e.title}: {e.error}</p>
          ))}
          <Button variant="outline" onClick={handleSeed}>Try Again</Button>
        </div>
      )}
    </div>
  );
}
