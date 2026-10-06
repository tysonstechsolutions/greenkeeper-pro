// @vitest-environment node
import { describe, expect, it } from "vitest";
import { COST_CENTER_CODES, GL_ACCOUNT_CODES, SITE_CODES } from "@/lib/accounting/official-codes";
import {
  codeLabel,
  contextForRole,
  isOfficialCode,
  recommendCostCenter,
  recommendGlAccount,
  recommendHomeCostCenter,
  recommendLineCodes,
  recommendSite,
  recommendWorkOrderCostCenter,
} from "@/lib/accounting/recommend";
import { ALL_COST_CENTERS, PR_COST_CENTERS, PR_GL_ACCOUNTS, PR_SITES } from "@/lib/pr-accounting-codes";
import { DEFAULT_VALID_CODES } from "@/lib/pr-audit/audit";
import { areaForCostCenter } from "@/lib/money/areas";

describe("official listings (FY24 1353.228)", () => {
  it("has every site, cost center, and G/L account, each once", () => {
    expect(SITE_CODES).toHaveLength(33);
    expect(COST_CENTER_CODES).toHaveLength(74);
    expect(GL_ACCOUNT_CODES).toHaveLength(331);
    for (const list of [SITE_CODES, COST_CENTER_CODES, GL_ACCOUNT_CODES]) {
      expect(new Set(list.map((c) => c.code)).size).toBe(list.length);
    }
    expect(SITE_CODES.every((s) => /^7\d{3}$/.test(s.code))).toBe(true);
    expect(COST_CENTER_CODES.every((c) => /^\d{5}$/.test(c.code) && c.group && /^1353-\d{4}$/.test(c.fund))).toBe(true);
    expect(GL_ACCOUNT_CODES.every((g) => /^\d{6}$/.test(g.code))).toBe(true);
  });

  it("matches the printed listing", () => {
    expect(SITE_CODES.find((s) => s.code === "7011")).toEqual({
      code: "7011",
      label: "GLK BUCKLEY'S",
      address: "2821 GREAT LAKES DR BLDG 8400",
    });
    expect(SITE_CODES.find((s) => s.code === "7010")?.label).toBe("GLK GOLF COURSE MAINTENANCE");
    expect(COST_CENTER_CODES.find((c) => c.code === "20091")).toEqual({
      code: "20091",
      label: "GLK BUCKLEY'S F & B",
      group: "NS GREAT LAKES BUCKLEY'S F&B",
      fund: "1353-5247",
    });
    expect(COST_CENTER_CODES.find((c) => c.code === "25581")?.fund).toBe("1353-5246");
    expect(GL_ACCOUNT_CODES[0]).toEqual({ code: "102000", label: "RESTRICTED CASH CAPITAL OUTLAYS" });
    expect(GL_ACCOUNT_CODES.at(-1)).toEqual({ code: "914000", label: "PRIOR FY EXPENSE ADJUSTMENT" });
    expect(codeLabel("gl_account", "684000")).toBe("684000 — REPAIRS & MAINT GROUNDS");
    expect(codeLabel("cost_center", "99999")).toBe("99999");
    expect(isOfficialCode("site", "7009")).toBe(true);
    expect(isOfficialCode("site", "8400")).toBe(false);
  });

  it("puts the operation's codes first and validates against everything", () => {
    expect(PR_SITES.map((s) => s.value)).toEqual(["7009", "7010", "7011"]);
    expect(PR_COST_CENTERS.map((c) => c.value)).toContain("20091");
    expect(PR_GL_ACCOUNTS.map((g) => g.value)).toEqual(expect.arrayContaining(["151110", "151120", "684000", "701005"]));
    expect(ALL_COST_CENTERS).toHaveLength(74);
    expect(DEFAULT_VALID_CODES.glAccounts.size).toBe(331);
    expect(DEFAULT_VALID_CODES.costCenters.has("20574")).toBe(true);
    expect(areaForCostCenter("20091")).toBe("restaurant");
  });
});

describe("recommendations", () => {
  const line = (text: string, ctx: Parameters<typeof recommendLineCodes>[1] = null) => {
    const r = recommendLineCodes(text, ctx);
    return [r.costCenter?.code ?? null, r.site?.code ?? null, r.glAccount?.code ?? null];
  };

  it("suggests cost center, site, and G/L for golf course purchases", () => {
    expect(line("Fertilizer 18-0-18 50 lb")).toEqual(["25581", "7010", "684000"]);
    expect(line("Toro reel mower bedknife")).toEqual(["25581", "7010", "684000"]);
    expect(line("Aeration tines")).toEqual(["25581", "7010", "684000"]);
    expect(line("Tee markers set of 4")).toEqual(["25581", "7010", "684000"]);
    expect(line("Titleist golf balls dozen")).toEqual(["20086", "7009", "151130"]);
    expect(line("Range balls 1000 ct")).toEqual(["25224", "7009", "701000"]);
    expect(line("Golf cart battery 8V")).toEqual(["25229", "7009", "681000"]);
  });

  it("suggests Buckley's codes for food and drink", () => {
    expect(line("Hot dogs 10 lb case")).toEqual(["20091", "7011", "151110"]);
    expect(line("Budweiser keg")).toEqual(["20091", "7011", "151120"]);
  });

  it("lets supplies follow who is buying", () => {
    expect(line("Nitrile gloves box")).toEqual([null, null, "701005"]);
    expect(line("Nitrile gloves box", "buckleys")).toEqual(["20091", "7011", "701005"]);
    expect(line("Paper towels case", "maintenance")).toEqual(["25581", "7010", "701005"]);
    expect(line("HP toner cartridge", "golf")).toEqual(["20087", "7009", "701003"]);
    expect(line("Staff polo uniform", "golf")[2]).toBe("701006");
  });

  it("keeps resale accounts for resale cost centers only", () => {
    expect(recommendGlAccount("coffee", "25581")?.code).not.toBe("151110");
    expect(recommendGlAccount("", "20091")?.code).toBe("151110");
    expect(recommendGlAccount("", "")).toBeNull();
  });

  it("gives every suggestion a reason", () => {
    const r = recommendCostCenter("Fertilizer");
    expect(r?.reason).toMatch(/maintenance/i);
    expect(r?.reason).toContain('"fertilizer"');
    expect(recommendSite("20091")?.reason).toMatch(/Buckley/);
    expect(recommendSite("20574")).toBeNull();
  });

  it("knows who buys for what", () => {
    expect(contextForRole("fb_manager")).toBe("buckleys");
    expect(contextForRole("crew", "food_and_beverage")).toBe("buckleys");
    expect(contextForRole("mechanic")).toBe("maintenance");
    expect(contextForRole("gm")).toBeNull();
  });

  it("puts work orders where the work is", () => {
    expect(recommendWorkOrderCostCenter("VMGC @ 3311", "Leaking pipe").code).toBe("25581");
    expect(recommendWorkOrderCostCenter("VMGC @ 8400 Buckley's kitchen", "Fryer not heating").code).toBe("20091");
    expect(recommendWorkOrderCostCenter("Driving range", "Net torn").code).toBe("25224");
    expect(recommendWorkOrderCostCenter("Cart barn", "Door won't close").code).toBe("25229");
    expect(recommendWorkOrderCostCenter("VMGC @ 8400 pro shop", "Light out").code).toBe("20087");
    expect(recommendWorkOrderCostCenter("", "Something broke").code).toBe("20087");
  });

  it("suggests a home cost center from the HR position", () => {
    expect(recommendHomeCostCenter("Cook (Short Order Cook)")?.code).toBe("20091");
    expect(recommendHomeCostCenter("Food Service Worker")?.code).toBe("20091");
    expect(recommendHomeCostCenter("Laborer")?.code).toBe("25581");
    expect(recommendHomeCostCenter("Recreation Aid (Golf)")?.code).toBe("20087");
    expect(recommendHomeCostCenter("Golf Operations Asst")?.code).toBe("20087");
    expect(recommendHomeCostCenter("Anything", "food_and_beverage")?.code).toBe("20091");
    expect(recommendHomeCostCenter("")).toBeNull();
  });
});
