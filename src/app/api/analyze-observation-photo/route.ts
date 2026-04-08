import { NextRequest, NextResponse } from "next/server";
import { greenIssueTypeLabels } from "@/lib/green-constants";
import { issueTypeLabels } from "@/lib/hole-constants";
import type { GreenIssueType, HoleIssueType } from "@/types/database";

// POST /api/analyze-observation-photo
// Uses Claude Vision to analyze a turf photo and identify the issue
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI not configured. Add ANTHROPIC_API_KEY." },
      { status: 500 }
    );
  }

  try {
    const { image_base64, context, hole_number } = await req.json();

    if (!image_base64) {
      return NextResponse.json(
        { error: "image_base64 is required" },
        { status: 400 }
      );
    }

    // Determine which issue types to use based on context
    const isGreen = context === "green";
    const issueTypes = isGreen ? greenIssueTypeLabels : issueTypeLabels;
    const issueTypeList = Object.entries(issueTypes)
      .map(([key, label]) => `- "${key}": ${label}`)
      .join("\n");

    const surfaceType = isGreen
      ? "putting green (Creeping Bentgrass, Penncross/A-4 blend, HOC 0.110\"-0.135\")"
      : "fairway/hole area (Kentucky Bluegrass / Perennial Ryegrass blend)";

    const prompt = `You are the turf management specialist for Veterans Memorial Golf Course at Naval Station Great Lakes, IL (USDA Zone 5b-6a).

Analyze this photo of a ${surfaceType} on ${isGreen ? "Green" : "Hole"} #${hole_number || "?"}.

Based on what you see, provide:
1. A short title (5-10 words) describing the issue
2. A detailed description (2-4 sentences) of what you observe and potential causes
3. The best matching issue type from this list:
${issueTypeList}

IMPORTANT: Respond ONLY with valid JSON in this exact format, no other text:
{"title": "...", "description": "...", "issue_type": "..."}

If the photo doesn't clearly show a turf issue, still provide your best assessment of what you see. Use "other" as the issue_type only if nothing else fits.`;

    // Strip data URL prefix if present
    let base64Data = image_base64;
    let mediaType = "image/jpeg";
    const dataUrlMatch = image_base64.match(
      /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/
    );
    if (dataUrlMatch) {
      mediaType = dataUrlMatch[1];
      base64Data = dataUrlMatch[2];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 512,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: base64Data,
                  },
                },
                {
                  type: "text",
                  text: prompt,
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("Claude Vision API error:", response.status, errBody);
        return NextResponse.json(
          { error: "AI service error" },
          { status: 502 }
        );
      }

      const data = await response.json();
      const text =
        data.content?.[0]?.type === "text" ? data.content[0].text : "";

      // Parse JSON from response (handle potential markdown wrapping)
      let parsed: { title?: string; description?: string; issue_type?: string } = {};
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.error("Failed to parse AI response as JSON:", text);
        return NextResponse.json(
          { error: "Failed to parse AI response" },
          { status: 502 }
        );
      }

      // Validate issue_type is in allowed list
      const validIssueTypes = Object.keys(issueTypes);
      const issueType = validIssueTypes.includes(parsed.issue_type || "")
        ? parsed.issue_type
        : "other";

      return NextResponse.json({
        title: (parsed.title || "Turf Issue").slice(0, 100),
        description: (parsed.description || "").slice(0, 1000),
        issue_type: issueType as GreenIssueType | HoleIssueType,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("Photo analysis error:", err);
    return NextResponse.json(
      { error: "Failed to analyze photo" },
      { status: 500 }
    );
  }
}
