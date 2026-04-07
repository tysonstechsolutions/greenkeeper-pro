import { NextRequest, NextResponse } from "next/server";

// POST /api/fix-instructions
// Generates step-by-step fix instructions for a hole observation using Claude
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI not configured. Add ANTHROPIC_API_KEY." },
      { status: 500 }
    );
  }

  try {
    const { title, issue_type, priority, description, hole_number } = await req.json();

    if (!title || !issue_type) {
      return NextResponse.json(
        { error: "title and issue_type are required" },
        { status: 400 }
      );
    }

    const issueTypeLabels: Record<string, string> = {
      fungus_disease: "Fungus / Disease",
      dry_spot: "Dry Spot",
      wet_area: "Wet Area",
      bare_spot: "Bare Spot",
      weed_pressure: "Weed Pressure",
      pest_damage: "Pest Damage",
      mechanical_damage: "Mechanical Damage",
      drainage: "Drainage Issue",
      bunker_issue: "Bunker Issue",
      tree_issue: "Tree Issue",
      irrigation_issue: "Irrigation Issue",
      turf_thin: "Thin Turf",
      algae: "Algae",
      frost_damage: "Frost Damage",
      other: "Other",
    };

    const issueLabel = issueTypeLabels[issue_type] || issue_type;

    const prompt = `You are the turf management expert for Veterans Memorial Golf Course at Naval Station Great Lakes, IL (USDA Zone 5b-6a). The course has Creeping Bentgrass greens and Kentucky Bluegrass/Perennial Ryegrass fairways.

A ${priority || "normal"} priority issue has been reported on Hole ${hole_number || "?"}:
- Issue: ${title}
- Type: ${issueLabel}
${description ? `- Details: ${description}` : ""}
- Current date: ${new Date().toLocaleDateString()}

Write clear, step-by-step fix instructions that a crew member can follow. Be specific about:
1. What products/chemicals to use (with application rates if applicable)
2. Equipment needed
3. Step-by-step process
4. Timeline/frequency of treatment
5. What to monitor after treatment

Keep it practical and concise — this will be read on a phone screen. Use numbered steps. Don't include a title or header, just the instructions.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

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
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("Claude API error:", response.status, errBody);
        return NextResponse.json(
          { error: "AI service error" },
          { status: 502 }
        );
      }

      const data = await response.json();
      const text =
        data.content?.[0]?.type === "text" ? data.content[0].text : "";

      return NextResponse.json({ fix_instructions: text.trim() });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("Fix instructions generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate fix instructions" },
      { status: 500 }
    );
  }
}
