/**
 * Find vendors that are probably the same business entered twice, so they
 * can be combined into one.
 *
 * Two vendors are grouped when their names match after cleanup (case,
 * punctuation, "&" vs "and", and endings like Inc / LLC / Co / Corp are
 * ignored), or when they share the same SAM.gov UEI or CAGE code. Grouping
 * is transitive: if A matches B and B matches C, all three are one group.
 * Nothing is combined automatically — the GM confirms each group.
 */

export interface DuplicateCandidate {
  id: string;
  name: string;
  company?: string | null;
  notes?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city_state_zip?: string | null;
  poc?: string | null;
  sap_vendor_no?: string | null;
  gsa_naf_other_no?: string | null;
  section_889_path?: string | null;
  section_889_expiration_date?: string | null;
  merged_into_id?: string | null;
}

/** Business-name endings that don't make two vendors different. */
const SUFFIXES = new Set([
  "inc", "incorporated", "llc", "co", "company", "corp", "corporation",
  "ltd", "limited", "lp", "llp", "pc", "pllc", "the",
]);

/** "The Russo Hardware, Inc." → "russo hardware". */
export function normalizeVendorName(name: string | null | undefined): string {
  const words = (name ?? "")
    .toLowerCase()
    .replace(/\bl\.?\s*l\.?\s*c\b\.?/g, "llc")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  // Drop "the" at the start and any business suffixes at the end.
  while (words.length > 1 && words[0] === "the") words.shift();
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

/** SAM.gov ids the 889 quick-add writes into notes ("UEI: ABC123 · CAGE: 1XYZ2"). */
export function samIds(notes: string | null | undefined): string[] {
  const ids: string[] = [];
  for (const m of (notes ?? "").matchAll(/\b(UEI|CAGE)\s*:\s*([A-Z0-9]{5,12})\b/gi)) {
    ids.push(`${m[1].toUpperCase()}:${m[2].toUpperCase()}`);
  }
  return ids;
}

/** How complete a vendor record is — the best one is suggested as the keeper. */
export function completeness(v: DuplicateCandidate): number {
  const fields = [
    v.company, v.phone, v.email, v.address, v.city_state_zip, v.poc,
    v.sap_vendor_no, v.gsa_naf_other_no, v.notes,
  ];
  return fields.filter((f) => (f ?? "").toString().trim()).length + (v.section_889_path ? 3 : 0);
}

/**
 * Suggested vendor to keep: the one with an 889 good the longest, then the
 * most filled-in details, then the shortest (cleanest) name.
 */
export function suggestKeeper<T extends DuplicateCandidate>(group: T[]): T {
  return [...group].sort((a, b) => {
    const ea = a.section_889_path ? a.section_889_expiration_date ?? "0000" : "";
    const eb = b.section_889_path ? b.section_889_expiration_date ?? "0000" : "";
    if (ea !== eb) return eb.localeCompare(ea);
    const c = completeness(b) - completeness(a);
    if (c !== 0) return c;
    return a.name.length - b.name.length;
  })[0];
}

/** Groups of 2+ active (not already combined) vendors that look like the same business. */
export function findDuplicateGroups<T extends DuplicateCandidate>(vendors: T[]): T[][] {
  const active = vendors.filter((v) => !v.merged_into_id);
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const v of active) parent.set(v.id, v.id);

  const firstByKey = new Map<string, string>();
  const link = (key: string, id: string) => {
    const first = firstByKey.get(key);
    if (first) union(first, id);
    else firstByKey.set(key, id);
  };
  for (const v of active) {
    const name = normalizeVendorName(v.name);
    if (name) link(`name:${name}`, v.id);
    for (const sam of samIds(v.notes)) link(`sam:${sam}`, v.id);
  }

  const groups = new Map<string, T[]>();
  for (const v of active) {
    const root = find(v.id);
    groups.set(root, [...(groups.get(root) ?? []), v]);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => a.name.localeCompare(b.name)))
    .sort((a, b) => a[0].name.localeCompare(b[0].name));
}
