import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/reports/pdf
 *
 * Server-side PDF generation endpoint.
 * Accepts report data and returns a PDF blob.
 *
 * Note: For complex PDF generation, we use a simplified approach
 * that generates HTML and can be printed client-side.
 * The actual PDF generation happens client-side using html2canvas + jsPDF.
 *
 * This endpoint primarily validates access and provides report data
 * formatted for PDF generation.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's profile to check permissions
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, active_course_id")
      .eq("id", user.id)
      .single();

    if (!profile?.active_course_id) {
      return NextResponse.json(
        { error: "No active course selected" },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { reportType, params } = body;

    if (!reportType) {
      return NextResponse.json(
        { error: "Report type is required" },
        { status: 400 }
      );
    }

    // Validate report type
    const validTypes = [
      "daily",
      "weekly",
      "monthly",
      "staff",
      "chemical",
      "equipment",
    ];
    if (!validTypes.includes(reportType)) {
      return NextResponse.json(
        { error: `Invalid report type. Valid types: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Check role-based access for certain reports
    const restrictedReports = ["staff", "chemical"];
    if (
      restrictedReports.includes(reportType) &&
      !["super_admin", "superintendent", "assistant_superintendent"].includes(
        profile.role
      )
    ) {
      return NextResponse.json(
        { error: "Insufficient permissions for this report type" },
        { status: 403 }
      );
    }

    // Generate report metadata
    const reportMetadata = generateReportMetadata(reportType, params);

    return NextResponse.json({
      success: true,
      reportType,
      metadata: reportMetadata,
      generatedAt: new Date().toISOString(),
      courseId: profile.active_course_id,
    });
  } catch (error) {
    console.error("Error in PDF report endpoint:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reports/pdf
 *
 * Returns available report types and their parameters.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isSupervisor = ["super_admin", "superintendent", "assistant_superintendent"].includes(
      profile?.role || ""
    );

    // Return available report types based on role
    const reportTypes = [
      {
        id: "daily",
        name: "Daily Operations Report",
        description: "Summary of daily activities, tasks, and conditions",
        params: ["date"],
        available: true,
      },
      {
        id: "weekly",
        name: "Weekly Summary Report",
        description: "Week-over-week performance and highlights",
        params: ["weekStart"],
        available: true,
      },
      {
        id: "monthly",
        name: "Monthly Condition Report",
        description: "Comprehensive monthly analysis with trends",
        params: ["year", "month"],
        available: true,
      },
      {
        id: "staff",
        name: "Staff Performance Report",
        description: "Individual staff productivity and metrics",
        params: ["userId", "dateRange"],
        available: isSupervisor,
        requiresRole: "superintendent",
      },
      {
        id: "chemical",
        name: "Chemical Compliance Report",
        description: "Application records and compliance tracking",
        params: ["dateRange"],
        available: isSupervisor,
        requiresRole: "superintendent",
      },
      {
        id: "equipment",
        name: "Equipment Fleet Report",
        description: "Maintenance history and fleet status",
        params: ["dateRange"],
        available: true,
      },
    ];

    return NextResponse.json({
      reportTypes,
      userRole: profile?.role,
    });
  } catch (error) {
    console.error("Error fetching report types:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Generate metadata for a report
 */
function generateReportMetadata(
  reportType: string,
  params: Record<string, unknown> | undefined
): Record<string, unknown> {
  const now = new Date();

  switch (reportType) {
    case "daily":
      return {
        title: "Daily Operations Report",
        date: params?.date || now.toISOString().split("T")[0],
        sections: [
          "weather",
          "tasks",
          "staff",
          "equipment",
          "chemicals",
          "photos",
        ],
      };

    case "weekly":
      return {
        title: "Weekly Summary Report",
        weekStart:
          params?.weekStart ||
          getWeekStart(now).toISOString().split("T")[0],
        sections: [
          "taskCompletion",
          "staffPerformance",
          "weatherSummary",
          "budget",
          "highlights",
        ],
      };

    case "monthly":
      return {
        title: "Monthly Condition Report",
        year: params?.year || now.getFullYear(),
        month: params?.month || now.getMonth() + 1,
        sections: [
          "weeklySummaries",
          "zoneConditions",
          "budget",
          "staffRankings",
          "chemicals",
          "equipment",
        ],
      };

    case "staff":
      return {
        title: "Staff Performance Report",
        userId: params?.userId,
        dateRange: params?.dateRange || getDefaultDateRange(30),
        sections: [
          "taskHistory",
          "efficiency",
          "attendance",
          "certifications",
        ],
      };

    case "chemical":
      return {
        title: "Chemical Compliance Report",
        dateRange: params?.dateRange || getDefaultDateRange(30),
        sections: [
          "applications",
          "productsSummary",
          "applicatorLog",
          "reiCompliance",
        ],
      };

    case "equipment":
      return {
        title: "Equipment Fleet Report",
        dateRange: params?.dateRange || getDefaultDateRange(90),
        sections: [
          "fleetSummary",
          "maintenanceLog",
          "costs",
          "upcomingService",
        ],
      };

    default:
      return { title: "Report", generatedAt: now.toISOString() };
  }
}

/**
 * Get the start of the current week (Monday)
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get a default date range for the last N days
 */
function getDefaultDateRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}
