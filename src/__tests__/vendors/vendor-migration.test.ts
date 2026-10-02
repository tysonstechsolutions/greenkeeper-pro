import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const migration = read("supabase/migrations/20261002150000_vendor_889_one_year_and_merge.sql");

describe("vendor 889 + merge migration contract", () => {
  it("only repairs the old automatic Oct 1 expirations, and marks them estimated", () => {
    expect(migration).toContain("EXTRACT(MONTH FROM section_889_expiration_date) = 10");
    expect(migration).toContain("AND section_889_signed_date IS NULL");
    expect(migration).toContain("section_889_signed_date_estimated = TRUE");
    expect(migration).toContain("+ INTERVAL '1 year'");
  });

  it("combines without deleting and only for managers", () => {
    expect(migration).toContain("IF NOT public.is_manager() THEN");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.vendors/i);
    expect(migration).toContain("status NOT IN ('completed', 'verified')");
  });

  it("hides combined vendors from every picker", () => {
    for (const file of [
      "src/app/vendors/page.tsx",
      "src/app/sole-source/page.tsx",
      "src/components/features/search/global-search.tsx",
      "src/lib/operations/use-duty-management.ts",
      "src/app/purchase-requests/new/page.tsx",
    ]) {
      expect(read(file), file).toContain("merged_into_id=is.null");
    }
  });
});
