/**
 * The latest US Foods invoice price for every product the cost cards use.
 * A database without invoices yet just gets the cards' own prices.
 */
import { directSelectAll } from "@/lib/supabase/rest";
import { cardProductNumbers, latestPrices, type LatestPrice } from "./cost-cards";

type Row = { product_number: string; unit_price: number; restaurant_purchases: { purchase_date: string } | null };

export async function loadCardPrices(): Promise<Map<string, LatestPrice>> {
  const rows = await directSelectAll<Row>("restaurant_purchase_lines", {
    columns: "product_number,unit_price,restaurant_purchases!inner(purchase_date)",
    filters: [`product_number=in.(${cardProductNumbers().join(",")})`, "unit_price=gt.0"],
    orderBy: [{ column: "id" }],
    pageSize: 1000,
    label: "costCards.prices",
  });
  return latestPrices(
    rows
      .filter((r) => r.restaurant_purchases)
      .map((r) => ({ product_number: r.product_number, unit_price: Number(r.unit_price), date: r.restaurant_purchases!.purchase_date })),
  );
}
