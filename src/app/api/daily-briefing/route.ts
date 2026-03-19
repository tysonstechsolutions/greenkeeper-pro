import { NextRequest, NextResponse } from "next/server";
import {
  generateDailyBriefing,
  getBriefingSettings,
  postDailyBriefing,
  ensureWeatherLogExists,
} from "@/lib/utils/generate-briefing";

// Secret key for authenticating cron jobs or manual triggers
const BRIEFING_SECRET = process.env.DAILY_BRIEFING_SECRET;

/**
 * POST /api/daily-briefing
 *
 * Generates and posts the daily briefing to the All Staff channel.
 *
 * Headers:
 *   Authorization: Bearer <DAILY_BRIEFING_SECRET>
 *
 * Query params:
 *   preview=true - Return the briefing content without posting
 *   date=YYYY-MM-DD - Generate briefing for a specific date (default: today)
 */
export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!BRIEFING_SECRET || token !== BRIEFING_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const isPreview = searchParams.get("preview") === "true";
    const dateParam = searchParams.get("date");

    // Determine the date
    let targetDate: Date;
    if (dateParam) {
      targetDate = new Date(dateParam + "T00:00:00");
      if (isNaN(targetDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format. Use YYYY-MM-DD" },
          { status: 400 }
        );
      }
    } else {
      targetDate = new Date();
    }

    // Get briefing settings
    const settings = await getBriefingSettings();

    // Check if briefing is enabled (skip for preview)
    if (!isPreview && !settings.enabled) {
      return NextResponse.json(
        {
          success: false,
          message: "Daily briefing is disabled in settings"
        },
        { status: 200 }
      );
    }

    // Ensure we have a weather log entry for today
    await ensureWeatherLogExists(targetDate);

    // Generate the briefing content
    const briefingContent = await generateDailyBriefing(targetDate, settings);

    // If preview mode, just return the content
    if (isPreview) {
      return NextResponse.json({
        success: true,
        preview: true,
        date: targetDate.toISOString().split("T")[0],
        content: briefingContent,
      });
    }

    // Post the briefing to All Staff channel
    const posted = await postDailyBriefing(briefingContent);

    if (!posted) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to post briefing. Check that the All Staff channel exists."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      date: targetDate.toISOString().split("T")[0],
      message: "Daily briefing posted successfully",
    });

  } catch (error) {
    console.error("Error generating daily briefing:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/daily-briefing
 *
 * Returns the current briefing settings and a preview of today's briefing.
 *
 * Headers:
 *   Authorization: Bearer <DAILY_BRIEFING_SECRET>
 */
export async function GET(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!BRIEFING_SECRET || token !== BRIEFING_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settings = await getBriefingSettings();
    const preview = await generateDailyBriefing(new Date(), settings);

    return NextResponse.json({
      settings,
      preview,
      date: new Date().toISOString().split("T")[0],
    });

  } catch (error) {
    console.error("Error fetching briefing info:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
