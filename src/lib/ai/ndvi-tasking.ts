/**
 * NDVI Stress Zone Analysis via Claude Vision
 *
 * Takes a drone flight preview PNG, sends it to Claude Vision to identify
 * areas of turf stress, and returns structured stress zone data suitable
 * for auto-generating scout tasks.
 */

export interface StressZone {
  description: string;            // "Northwest quadrant showing yellow/red stress pattern"
  estimatedHole: number | null;   // Best guess: hole number based on position
  severity: "minor" | "moderate" | "severe";
  suggestedAction: string;        // "Scout for dollar spot or dry spot"
}

export interface NDVIAnalysis {
  stressZones: StressZone[];
  summary: string;                // Claude's overall assessment
  tasksGenerated: number;
}

export async function analyzeNDVIForTasks(params: {
  imageUrl: string;               // Supabase Storage URL of the preview PNG
  flightDate: string;
  band: string;                   // 'ndvi', 'thermal', etc.
  courseContext: string;           // Description of the course layout for Claude
}): Promise<NDVIAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      stressZones: [],
      summary: "AI not configured. Add ANTHROPIC_API_KEY.",
      tasksGenerated: 0,
    };
  }

  // 1. Fetch the preview PNG and convert to base64
  let base64Data: string;
  let mediaType = "image/png";
  try {
    const imgResponse = await fetch(params.imageUrl);
    if (!imgResponse.ok) {
      return {
        stressZones: [],
        summary: `Failed to fetch preview image: HTTP ${imgResponse.status}`,
        tasksGenerated: 0,
      };
    }

    const contentType = imgResponse.headers.get("content-type");
    if (contentType && contentType.startsWith("image/")) {
      mediaType = contentType.split(";")[0];
    }

    const buffer = await imgResponse.arrayBuffer();
    base64Data = Buffer.from(buffer).toString("base64");
  } catch (err) {
    return {
      stressZones: [],
      summary: `Image fetch error: ${err instanceof Error ? err.message : "Unknown error"}`,
      tasksGenerated: 0,
    };
  }

  // 2. Build the Claude Vision prompt
  const bandLabel = params.band?.toUpperCase() || "NDVI";
  const prompt = `You are analyzing a ${bandLabel} drone survey image of Veterans Memorial Golf Course (18-hole course at Naval Station Great Lakes, IL).

${params.courseContext}

Flight date: ${params.flightDate}

For NDVI imagery: green areas indicate healthy turf (high NDVI), yellow/orange areas indicate moderate stress, and red/brown areas indicate severe stress or bare soil.
For thermal imagery: hot spots indicate stressed or dry turf.

Analyze the image and identify areas of turf stress. For each stress zone:
1. Describe its location (quadrant, approximate area)
2. Estimate which hole number it might be near (1-18), or null if unclear
3. Rate severity: "minor" (small spot, faint discoloration), "moderate" (noticeable area), or "severe" (large area, strong discoloration)
4. Suggest a scouting action (e.g., "Scout for dollar spot", "Check irrigation coverage", "Inspect for dry spot")

IMPORTANT: Respond ONLY with valid JSON in this exact format, no other text:
{"stressZones": [{"description": "...", "estimatedHole": 4, "severity": "moderate", "suggestedAction": "..."}], "summary": "Overall assessment in 1-2 sentences"}

If no significant stress is visible, return: {"stressZones": [], "summary": "No significant turf stress detected in this survey."}`;

  // 3. Call Claude Vision API
  try {
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
          max_tokens: 1024,
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
        return {
          stressZones: [],
          summary: `AI analysis failed (HTTP ${response.status})`,
          tasksGenerated: 0,
        };
      }

      const data = await response.json();
      const text =
        data.content?.[0]?.type === "text" ? data.content[0].text : "";

      // 4. Parse JSON from response
      return parseAnalysisResponse(text);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("NDVI analysis error:", err);
    return {
      stressZones: [],
      summary: `AI analysis error: ${err instanceof Error ? err.message : "Unknown error"}`,
      tasksGenerated: 0,
    };
  }
}

/** Parse Claude's response text into a structured NDVIAnalysis */
export function parseAnalysisResponse(text: string): NDVIAnalysis {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        stressZones: [],
        summary: "Could not parse AI response",
        tasksGenerated: 0,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate stressZones array
    const stressZones: StressZone[] = [];
    if (Array.isArray(parsed.stressZones)) {
      for (const zone of parsed.stressZones) {
        if (zone && typeof zone === "object" && zone.description) {
          const severity = ["minor", "moderate", "severe"].includes(zone.severity)
            ? (zone.severity as StressZone["severity"])
            : "moderate";

          stressZones.push({
            description: String(zone.description).slice(0, 200),
            estimatedHole:
              typeof zone.estimatedHole === "number" &&
              zone.estimatedHole >= 1 &&
              zone.estimatedHole <= 18
                ? zone.estimatedHole
                : null,
            severity,
            suggestedAction: String(zone.suggestedAction || "Scout this area").slice(0, 200),
          });
        }
      }
    }

    const summary = typeof parsed.summary === "string"
      ? parsed.summary.slice(0, 500)
      : stressZones.length === 0
        ? "No significant turf stress detected in this survey."
        : `Found ${stressZones.length} stress zone(s) requiring attention.`;

    return {
      stressZones,
      summary,
      tasksGenerated: stressZones.length,
    };
  } catch {
    return {
      stressZones: [],
      summary: "Failed to parse AI response as JSON",
      tasksGenerated: 0,
    };
  }
}

/** Generate a task title from a stress zone */
export function generateTaskTitle(zone: StressZone): string {
  const holeStr = zone.estimatedHole ? `Hole ${zone.estimatedHole}` : "Course area";
  const desc = zone.description.length > 60
    ? zone.description.slice(0, 57) + "..."
    : zone.description;
  return `Scout: ${holeStr} - ${desc} [${zone.severity}]`.slice(0, 150);
}

/** Map severity to task priority */
export function severityToPriority(severity: StressZone["severity"]): "normal" | "high" | "critical" {
  switch (severity) {
    case "minor":
      return "normal";
    case "moderate":
      return "high";
    case "severe":
      return "critical";
  }
}
