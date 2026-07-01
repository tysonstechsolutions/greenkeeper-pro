/**
 * Optional AI drafting for the DD-200 narratives (blocks 9 & 10). Reuses the
 * already-deployed `ai-assistant` edge function, framed as helping the golf
 * course so it stays inside the assistant's persona. Best-effort: returns null
 * on any error so the filler still works entirely by hand.
 */
import { callApi } from "@/lib/api/client";
import { defaultDispositionReason, type Circumstance } from "./reasons";
import type { Fy26Asset } from "@/types/fy26-assets";

const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** First usable photo URL on an asset (main, then condition angles). */
function firstAssetPhoto(asset: Fy26Asset): string | null {
  const urls = [
    asset.photo_url,
    asset.condition_photos?.front,
    asset.condition_photos?.back,
    asset.condition_photos?.left,
    asset.condition_photos?.right,
  ];
  return urls.find((u): u is string => !!u && u.trim().length > 0) ?? null;
}

async function fetchImageBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let mediaType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!mediaType) {
      if (bytes[0] === 0x89 && bytes[1] === 0x50) mediaType = "image/png";
      else if (bytes[0] === 0xff && bytes[1] === 0xd8) mediaType = "image/jpeg";
    }
    if (!ALLOWED_IMAGE.includes(mediaType)) return null;
    let bin = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return { base64: btoa(bin), mediaType };
  } catch {
    return null;
  }
}

/**
 * Draft a damaged/destroyed disposition reason from the asset's photo via
 * dd-forms-ai. Always resolves — falls back to the deterministic default if
 * there's no photo, the function isn't deployed, or anything errors.
 */
export async function draftDamageReason(
  asset: Fy26Asset,
  circumstance: Circumstance,
  item: string,
): Promise<string> {
  const fallback = defaultDispositionReason(circumstance);
  const url = firstAssetPhoto(asset);
  if (!url) return fallback;
  const img = await fetchImageBase64(url);
  if (!img) return fallback;
  try {
    const res = await callApi<{ reason?: string }>("dd-forms-ai", {
      method: "POST",
      body: {
        action: "describe_damage",
        imageBase64: img.base64,
        mediaType: img.mediaType,
        item,
        circumstance,
      },
    });
    return res?.reason?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export interface Dd200NarrativeInput {
  item: string;
  disposition: string;
  whatHappened: string;
}

export async function draftDd200Narratives(
  input: Dd200NarrativeInput,
): Promise<{ circumstances: string; actions: string } | null> {
  const prompt = `You are helping the golf course (MWR N92, Naval Station Great Lakes) complete a DD Form 200, Financial Liability Investigation of Property Loss, for a piece of course property. Write two short, factual, professional narratives in plain English. No markdown, no bullet points, no headers other than the two labels requested.

Item: ${input.item || "(unspecified property item)"}
Disposition: ${input.disposition || "(not specified)"}
What happened (staff notes): ${input.whatHappened || "(none provided)"}

Return EXACTLY this, filling in the brackets:
CIRCUMSTANCES:
[2-4 sentences describing the circumstances under which the property was lost, damaged, or destroyed]
ACTIONS:
[1-3 sentences describing the actions taken to correct the circumstances and prevent future occurrences]`;

  try {
    const reply = await callApi<{ reply?: string; error?: string }>("ai-assistant", {
      method: "POST",
      body: { message: prompt, history: [] },
    });
    const norm = (reply?.reply ?? "").replace(/\*\*/g, "").replace(/__/g, "");
    const grab = (label: string, next: string): string =>
      (norm.match(new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)(?=${next}|$)`, "i"))?.[1] ?? "").trim();
    const circumstances = grab("CIRCUMSTANCES", "ACTIONS\\s*:?");
    const actions = grab("ACTIONS", "$");
    if (!circumstances && !actions) return null;
    return { circumstances, actions };
  } catch {
    return null;
  }
}
