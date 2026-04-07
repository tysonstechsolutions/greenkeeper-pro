import { NextRequest, NextResponse } from "next/server";
import { greenIssueTypeLabels } from "@/lib/green-constants";
import type { GreenIssueType } from "@/types/database";

// POST /api/green-fix-instructions
// Generates step-by-step fix instructions for a green observation using Claude
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

    const issueLabel = greenIssueTypeLabels[issue_type as GreenIssueType] || issue_type;

    const prompt = `You are the putting green specialist for Veterans Memorial Golf Course at Naval Station Great Lakes, IL (USDA Zone 5b-6a). The greens are Creeping Bentgrass (Penncross/A-4 blend) maintained at a height of cut between 0.110" - 0.135".

A ${priority || "normal"} priority issue has been reported on Green #${hole_number || "?"}:
- Issue: ${title}
- Type: ${issueLabel}
${description ? `- Details: ${description}` : ""}
- Current date: ${new Date().toLocaleDateString()}

Write clear, step-by-step fix instructions that a crew member can follow. Be specific about:
1. What products/chemicals to use (with application rates per 1000 sq ft if applicable)
2. Equipment needed (walk mowers, aerators, topdresser, etc.)
3. Step-by-step process specific to putting green maintenance
4. Timeline/frequency of treatment
5. What to monitor after treatment (green speed, moisture levels, color)
6. Any areas to rope off or mark for golfer traffic management

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
    console.error("Green fix instructions generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate fix instructions" },
      { status: 500 }
    );
  }
}
