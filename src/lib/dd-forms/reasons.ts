/**
 * Default disposition-reason text per circumstance, more specific than the old
 * catch-all "Beyond economical repair". The AI (dd-forms-ai describe_damage) can
 * replace a damaged/destroyed reason with one drawn from the asset's photo; these
 * are the deterministic starting points and the fallback when AI isn't available.
 */
export type Circumstance = "lost" | "damaged" | "destroyed";

const REASONS: Record<Circumstance, string> = {
  lost: "Item cannot be located on the grounds and there is no record of it having been under my management.",
  damaged: "Unit is damaged and inoperable; repair is not economical.",
  destroyed: "Unit is destroyed and beyond economical repair; no longer serviceable.",
};

/** The starting reason for a circumstance (used to pre-fill the packet builder). */
export function defaultDispositionReason(circumstance: Circumstance): string {
  return REASONS[circumstance] ?? REASONS.destroyed;
}

/** True when this circumstance benefits from an AI look at the photo. */
export function usesPhotoReason(circumstance: Circumstance): boolean {
  return circumstance === "damaged" || circumstance === "destroyed";
}
