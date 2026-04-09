import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Full Report Download
 * Fetches all individual reports and returns them as a ZIP archive.
 * Uses JSZip to bundle: equipment, parking lot, clubhouse, and observation reports.
 */

export async function GET(request: NextRequest) {
  try {
    // ── AUTH ──
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = new URL(request.url).origin;
    const cookies = request.headers.get("cookie") || "";

    // Fetch all reports in parallel
    const reportConfigs = [
      { name: "equipment-report", filename: "vmgc-equipment-report.pdf" },
      { name: "parking-lot-report", filename: "vmgc-parking-lot-report.pdf" },
      { name: "clubhouse-report", filename: "vmgc-clubhouse-report.pdf" },
      { name: "observation-report", filename: "vmgc-observation-report.pdf" },
      { name: "order-list-report", filename: "vmgc-order-list-report.pdf" },
    ];

    const reportResults = await Promise.allSettled(
      reportConfigs.map(async (cfg) => {
        const res = await fetch(`${baseUrl}/api/reports/${cfg.name}`, {
          headers: { cookie: cookies },
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return { filename: cfg.filename, data: Buffer.from(buf) };
      })
    );

    // Filter out failed reports
    const reports: { filename: string; data: Buffer }[] = [];
    for (const result of reportResults) {
      if (result.status === "fulfilled" && result.value) {
        reports.push(result.value);
      }
    }

    if (reports.length === 0) {
      return NextResponse.json({ error: "No reports could be generated" }, { status: 500 });
    }

    // If only one report succeeded, return it directly as PDF
    if (reports.length === 1) {
      return new NextResponse(new Uint8Array(reports[0].data), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${reports[0].filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Use JSZip to bundle multiple reports
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const dateStr = new Date().toISOString().slice(0, 10);

    for (const report of reports) {
      zip.file(report.filename, report.data);
    }

    // Add a summary text file
    zip.file("README.txt",
      `VMGC GreenKeeper Pro — Full Report Download\n` +
      `Generated: ${new Date().toLocaleString()}\n` +
      `Reports included: ${reports.length}\n\n` +
      reports.map((r) => `  - ${r.filename}`).join("\n") + "\n"
    );

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="vmgc-full-report-${dateStr}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Full report download error:", msg, err);
    return NextResponse.json({ error: "Failed to generate full report", details: msg }, { status: 500 });
  }
}
