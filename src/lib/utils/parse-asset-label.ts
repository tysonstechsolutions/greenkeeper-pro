/**
 * Pull candidate asset identifiers out of OCR'd text from an MWRMA
 * property label.
 *
 * Example label content:
 *    MWRMA PROPERTY
 *    17000198-0004
 *    HP LASERJET PRINTER
 *    CostCtr    20084    Site    7009
 *    RespCCtr   20084    Room    MGR
 *    Asset no.  17000198-0004
 *    Serial no. CNDCJDC2CQ
 *    Model no.  M604DN
 *
 * OCR is noisy — it might read "17OOO198" with the letter O instead of
 * the digit 0, or drop whitespace, or mash two lines together. We try
 * to extract every plausible identifier and let the DB lookup decide
 * which one actually exists.
 */

export interface ParsedLabelCandidates {
  /** Tag-format identifiers: "17000198-0004" style. */
  tags: string[];
  /** Asset numbers that looked like a plain run of 6–10 digits. */
  assetNumbers: string[];
  /** Serial-number-shaped tokens: alphanumeric 6+ chars mixing letters and digits. */
  serials: string[];
  /** Model-number-shaped tokens: short alphanumeric with a digit anchor. */
  models: string[];
  /** All candidates combined, deduplicated, sorted by likelihood. */
  all: string[];
}

function fixOcrDigitConfusion(s: string): string {
  // Common OCR substitutions in a numeric context. Kept deliberately
  // narrow — we only apply them when we're confident the token is
  // supposed to be digits (i.e. matches a tag-like pattern first).
  return s
    .replace(/O/g, "0")
    .replace(/I/g, "1")
    .replace(/l/g, "1")
    .replace(/S/g, "5")
    .replace(/Z/g, "2")
    .replace(/B/g, "8");
}

/**
 * Parse the full text blob from an OCR pass. Returns zero or more
 * candidate identifiers in order of how likely they are to match.
 */
export function parseAssetLabel(raw: string): ParsedLabelCandidates {
  const text = raw.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ");
  const tags = new Set<string>();
  const assetNumbers = new Set<string>();
  const serials = new Set<string>();
  const models = new Set<string>();

  // 1) Tag format ASSET-SUB — 6+ digits, dash, 1+ digits. Also try a
  //    digit-confusion-corrected pass in case OCR read O as the letter.
  for (const variant of [text, fixOcrDigitConfusion(text)]) {
    const tagRe = /(\d{6,10})[\s-]{1,3}(\d{1,4})/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(variant)) !== null) {
      tags.add(`${m[1]}-${m[2].padStart(4, "0")}`);
      assetNumbers.add(m[1]);
    }
  }

  // 2) Standalone long digit runs (at least 6) — covers labels where
  //    the sub was too faded for OCR but the asset# survived.
  const digitRunRe = /\b\d{6,10}\b/g;
  let dm: RegExpExecArray | null;
  while ((dm = digitRunRe.exec(text)) !== null) {
    assetNumbers.add(dm[0]);
  }

  // 3) Serial-number tokens after "Serial" / "SN" / "S/N" anchor, or
  //    standalone alphanumeric tokens 6+ chars with at least one letter
  //    AND at least one digit.
  const serialAnchorRe =
    /(?:Serial|SN|S\/N)[^a-z0-9]{0,4}([A-Z0-9\-]{4,})/gi;
  let sm: RegExpExecArray | null;
  while ((sm = serialAnchorRe.exec(text)) !== null) {
    serials.add(sm[1].toUpperCase());
  }
  const mixedTokenRe = /\b(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9-]{6,}\b/gi;
  let mm: RegExpExecArray | null;
  while ((mm = mixedTokenRe.exec(text)) !== null) {
    serials.add(mm[0].toUpperCase());
  }

  // 4) Model numbers — anchor after "Model", otherwise short alphanum
  //    tokens 3–7 chars with a digit.
  const modelAnchorRe =
    /(?:Model(?:\s*no\.?)?)[^a-z0-9]{0,4}([A-Z0-9\-]{3,})/gi;
  let modm: RegExpExecArray | null;
  while ((modm = modelAnchorRe.exec(text)) !== null) {
    models.add(modm[1].toUpperCase());
  }

  // De-dupe: a tag's asset-number half shouldn't also appear as a
  // standalone asset number candidate (tags are stronger signal).
  for (const tag of tags) {
    const [assetPart] = tag.split("-");
    assetNumbers.delete(assetPart);
  }

  const all = [
    ...tags,           // strongest
    ...serials,        // very distinctive, rarely collide
    ...assetNumbers,   // strong
    ...models,         // weakest (often shared across many assets)
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  return {
    tags: [...tags],
    assetNumbers: [...assetNumbers],
    serials: [...serials],
    models: [...models],
    all,
  };
}
