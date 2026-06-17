/**
 * Deterministic, offline fallback templates.
 *
 * Last resort only: used when the paid AI is unreachable AND the library has
 * no close match. They produce a usable, clearly-labeled draft from the user's
 * own inputs so nobody is ever blocked. Always shown as "needs review".
 */
export interface TemplateResult {
  text: string;
  meta?: Record<string, unknown>;
}

export type TemplateFn = (
  meta: Record<string, unknown>,
  input: string,
) => TemplateResult;

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

export const AI_TEMPLATES: Record<string, TemplateFn> = {
  work_order: (meta, input) => {
    const facility = str(meta.facility, "VMGC");
    const area = str(meta.programArea);
    const where = area ? `${facility} — ${area}` : facility;
    return {
      text:
        `${input.trim()}\n\n` +
        `Work is required at ${where}. Please assess the issue described above, ` +
        `identify the cause, and complete all repairs needed to restore safe, ` +
        `normal operation. Replace any worn or failed components as required and ` +
        `verify proper function upon completion.`,
      meta: { workType: "Routine" },
    };
  },

  fix_instructions: (_meta, input) => ({
    text:
      `Offline checklist (AI unavailable — please review and edit):\n\n` +
      `1. Inspect the affected area: ${input.trim()}\n` +
      `2. Identify the most likely cause given recent weather and traffic.\n` +
      `3. Apply the standard corrective practice for this condition.\n` +
      `4. Reassess in 3–5 days; escalate if there's no improvement.`,
  }),

  green_fix_instructions: (_meta, input) => ({
    text:
      `Offline checklist (AI unavailable — please review and edit):\n\n` +
      `1. Inspect the green: ${input.trim()}\n` +
      `2. Check moisture, mowing height, and recent traffic/pin positions.\n` +
      `3. Apply the standard corrective practice (hand-water, raise HOC, ` +
      `light topdress, or spot-treat as appropriate).\n` +
      `4. Reassess in 3–5 days and adjust.`,
  }),

  sole_source: (_meta, input) => {
    const description = `This acquisition supports golf course operations at VMGC. ${input.trim()}`;
    const characteristics =
      `The specified source provides characteristics required for this requirement ` +
      `that are not available from other sources.`;
    const marketResearch =
      `A market survey was conducted and found no other source able to furnish this ` +
      `requirement. Only the named business can satisfy the need described above.`;
    return {
      text: `SECTION 3:\n${description}\n\nSECTION 4:\n${characteristics}\n\nSECTION 5:\n${marketResearch}`,
      meta: { description, characteristics, marketResearch },
    };
  },

  sow: (_meta, input) => {
    const expectation =
      `1. Mobilize to the site and coordinate with the COR.\n` +
      `2. Perform the work described: ${input.trim()}.\n` +
      `3. Comply with all OSHA and Navy safety requirements.\n` +
      `4. Remove and dispose of all debris and packaging.\n` +
      `5. Document the work performed and provide a completion report to the COR.`;
    const goods = `Services/goods for VMGC: ${input.trim()}.`;
    const certifications =
      `Contractor shall possess all applicable federal, state, and local licenses, ` +
      `certifications, and insurance required for this type of work.`;
    return {
      text: `EXPECTATION:\n${expectation}\n\nDESCRIPTION_OF_GOODS:\n${goods}\n\nCERTIFICATIONS:\n${certifications}`,
      meta: { expectation, goods, certifications },
    };
  },
};
