import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../utils/test-utils";
import {
  COST_CARDS,
  INGREDIENTS,
  cardCostFor,
  cardProductNumbers,
  latestPrices,
  priceCard,
  type LatestPrice,
} from "@/lib/restaurant/cost-cards";

const card = (name: string) => COST_CARDS.find((c) => c.name === name)!;
const none = new Map<string, LatestPrice>();

describe("cost cards", () => {
  it("prices each card at the card's own prices when no invoices are on file", () => {
    const burger = priceCard(card("Cheeseburger"), none);
    expect(burger.cost).toBe(2.54);
    expect(burger.lines.every((l) => l.source === "card")).toBe(true);

    const curds = priceCard(card("Side of cheese curds"), none);
    expect(curds.cost).toBe(2.32);
    expect(curds.costPct).toBe(46.4);
    expect(curds.priceAtStandard).toBe(6.75);

    expect(priceCard(card("Reuben"), none).cost).toBe(4.44);
  });

  it("uses the latest invoice price, but not one invoiced in a different unit", () => {
    const patty = INGREDIENTS.patty.productNumber!;
    const bun = INGREDIENTS.bun.productNumber!;
    const latest = latestPrices([
      { product_number: patty, unit_price: 50, date: "2026-08-01" },
      { product_number: patty, unit_price: 60, date: "2026-09-20" },
      { product_number: patty, unit_price: 55, date: "2026-09-01" },
      // A pack of 8 buns, not the case of 96: far off the card, so ignored.
      { product_number: bun, unit_price: 3.1, date: "2026-09-20" },
    ]);
    expect(latest.get(patty)).toEqual({ unitPrice: 60, date: "2026-09-20" });

    const p = priceCard(card("Cheeseburger"), latest);
    const pattyLine = p.lines.find((l) => l.key === "patty")!;
    expect(pattyLine.source).toBe("invoice");
    expect(pattyLine.priceDate).toBe("2026-09-20");
    expect(pattyLine.cost).toBe(2);
    const bunLine = p.lines.find((l) => l.key === "bun")!;
    expect(bunLine.source).toBe("card");
    expect(bunLine.unitDiffers).toBe(true);
    expect(p.cost).toBeGreaterThan(2.54);
  });

  it("finds a sold item's card by RecTrac's name, truncated or not", () => {
    const priced = COST_CARDS.map((c) => priceCard(c, none));
    expect(cardCostFor("SIDE OF CHEESE CU", priced)?.card.name).toBe("Side of cheese curds");
    expect(cardCostFor(" cheeseburger ", priced)?.card.name).toBe("Cheeseburger");
    expect(cardCostFor("PRETZEL BITES", priced)).toBeNull();
  });

  it("every card line is a known ingredient, and product numbers are unique", () => {
    for (const c of COST_CARDS) for (const [key] of c.lines) expect(INGREDIENTS[key]).toBeDefined();
    const nums = cardProductNumbers();
    expect(new Set(nums).size).toBe(nums.length);
    expect(nums).toContain(INGREDIENTS.patty.productNumber);
  });
});

vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>("@/components/auth/role-guard");
  return { ...actual, RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

vi.mock("@/lib/restaurant/load-card-prices", () => ({
  loadCardPrices: async () => new Map([[INGREDIENTS.patty.productNumber!, { unitPrice: 51.86, date: "2026-09-20" }]]),
}));

describe("Cost Cards page", () => {
  it("lists every card, flags the ones over 35%, and opens a card's build", async () => {
    const { default: CostCardsPage } = await import("@/app/restaurant/cost-cards/page");
    render(<CostCardsPage />);
    const table = await screen.findByRole("table", { name: "Cost cards" });
    expect(table).toHaveTextContent("Cheeseburger");
    expect(table).toHaveTextContent("Side of cheese curds");
    expect(table).toHaveTextContent("46.4%");
    expect(screen.getByText(/over the 35% standard/)).toHaveTextContent("Side of cheese curds");

    fireEvent.click(screen.getByText("Cheeseburger"));
    const ingredients = screen.getByRole("table", { name: "Cheeseburger ingredients" });
    expect(ingredients).toHaveTextContent("Beef patty");
    expect(ingredients).toHaveTextContent("Invoice Sep 20, 2026");
    expect(screen.getByText("Build")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show every card" }));
    expect(screen.getAllByRole("table").length).toBe(COST_CARDS.length + 1);
  });
});
