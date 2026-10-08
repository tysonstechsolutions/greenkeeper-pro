/**
 * Read a RecTrac "Navy - Movie Bulk Ticket Voucher Issue Report" (PDF, as
 * text lines from lib/pdf/text-lines): every ticket sold, grouped by ticket
 * code. At Buckley's each ticket code is one Graduate Family Welcome
 * Reception ($10 a ticket, sold online and at the counter).
 *
 * Exact, no AI: each ticket code is checked against its own count and fee
 * total, and the whole against the grand totals, receipts, and codes.
 *
 * The money is shared: 60% of every ticket is Buckley's (restaurant sales)
 * and 40% is the golf program's (see TICKET_SPLIT).
 *
 * Pure. ticketsAsFlash turns it into the same shape as a flash report so it
 * saves through the same path (daily restaurant sales + items by day).
 */
import type { FlashReport, FlashSale } from "./rectrac-flash";

export interface TicketSale {
  ticketCode: string;
  /** yyyy-mm-dd the ticket was bought. */
  date: string;
  receipt: string;
  user: string;
  serial: string;
  fee: number;
  discount: number;
  net: number;
}

export interface TicketEvent {
  ticketCode: string;
  description: string;
  tickets: number;
  total: number;
  firstSale: string;
  lastSale: string;
  /** The Wednesday on or after the last sale: when the reception most likely was. */
  likelyDate: string;
}

export interface TicketReport {
  title: string;
  /** yyyy-mm-dd the report was run. */
  runDate: string | null;
  sales: TicketSale[];
  events: TicketEvent[];
  grandCount: number | null;
  grandFees: number | null;
  transactions: number | null;
  ticketsWithTransaction: number | null;
  /** Problems found checking the report against itself. Empty = exact. */
  mismatches: string[];
  /** Things worth knowing that aren't errors. */
  notes: string[];
}

/** sales_reports.category for ticket reports: how they're told apart from flash reports. */
export const TICKET_CATEGORY = "Reception tickets";

/** Each reception ticket's money: 60% to Buckley's, 40% to the golf program. */
export const TICKET_SPLIT = { buckleys: 0.6, golf: 0.4 } as const;

/** Split an amount of ticket sales; the golf share takes the rounding so the two add back up exactly. */
export function splitTicketAmount(amount: number): { buckleys: number; golf: number } {
  const buckleys = Math.round(amount * TICKET_SPLIT.buckleys * 100) / 100;
  return { buckleys, golf: Math.round((amount - buckleys) * 100) / 100 };
}

const MONEY = String.raw`-?[\d,]+\.\d{2}`;
const SALE = new RegExp(
  String.raw`^(?:([A-Z]{2}\d{4}-[\d-]+)\s+)?(?:(.+?)\s+)?(\d{2}/\d{2}/\d{4})\s+(\d+)\s+(\S+)\s+(\d+)\s+(${MONEY})\s+(${MONEY})\s+(${MONEY})$`,
);
/** "11 110 0.00": tickets, fees, discounts for one ticket code. */
const CODE_TOTAL = new RegExp(String.raw`^(\d+)\s+(-?[\d,]+(?:\.\d+)?)\s+(${MONEY})$`);

const money = (s: string) => Number(s.replace(/,/g, ""));
const r2 = (n: number) => Math.round(n * 100) / 100;

function iso(mdY: string): string {
  const [m, d, y] = mdY.split("/");
  return `${y}-${m}-${d}`;
}

/** The Wednesday on or after a date. */
export function wednesdayOnOrAfter(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((3 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/** RecTrac cuts descriptions at 27 characters. */
function fullDescription(s: string): string {
  return /^Graduate Family Welcome Rec/i.test(s) ? "Graduate Family Welcome Reception" : s.trim();
}

export function isTicketReport(lines: string[]): boolean {
  return lines.slice(0, 8).some((l) => /Bulk Ticket Voucher Issue Report/i.test(l));
}

export function parseTicketReport(lines: string[]): TicketReport | null {
  if (!isTicketReport(lines)) return null;
  const sales: TicketSale[] = [];
  const descriptions = new Map<string, string>();
  const codeTotals = new Map<string, { count: number; fees: number }>();
  let code: string | null = null;
  let grandCount: number | null = null;
  let grandFees: number | null = null;
  let runDate: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const run = line.match(/Run Date\/Time:\s*(\d{2}\/\d{2}\/\d{4})/);
    if (run) {
      runDate ??= iso(run[1]);
      continue;
    }
    const grand = line.match(/^Report Grand Totals\s+(\d+)\s+(-?[\d,]+(?:\.\d+)?)/i);
    if (grand) {
      grandCount = Number(grand[1]);
      grandFees = money(grand[2]);
      continue;
    }
    const m = line.match(SALE);
    if (m) {
      // A new page repeats the ticket code (and description) on its first line.
      if (m[1]) code = m[1];
      if (!code) continue;
      if (m[2] && !descriptions.has(code)) descriptions.set(code, fullDescription(m[2]));
      sales.push({
        ticketCode: code,
        date: iso(m[3]),
        receipt: m[4],
        user: m[5],
        serial: m[6],
        fee: money(m[7]),
        discount: money(m[8]),
        net: money(m[9]),
      });
      continue;
    }
    const t = line.match(CODE_TOTAL);
    if (t && code && !codeTotals.has(code)) codeTotals.set(code, { count: Number(t[1]), fees: money(t[2]) });
  }

  const num = (re: RegExp) => {
    const v = Number(lines.find((l) => re.test(l.trim()))?.match(/(\d+)\s*$/)?.[1] ?? NaN);
    return Number.isFinite(v) ? v : null;
  };
  const transactions = num(/^Total Transactions:/i);
  const ticketsWithTransaction = num(/^Tickets with a Transaction:/i);

  // Each reception, in ticket code order.
  const byCode = new Map<string, TicketSale[]>();
  for (const s of sales) byCode.set(s.ticketCode, [...(byCode.get(s.ticketCode) ?? []), s]);
  const lastDescription = [...descriptions.values()][0] ?? "Ticket";
  const events: TicketEvent[] = [...byCode.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ticketCode, list]) => {
      const dates = list.map((s) => s.date).sort();
      return {
        ticketCode,
        description: descriptions.get(ticketCode) ?? lastDescription,
        tickets: list.length,
        total: r2(list.reduce((s, x) => s + x.net, 0)),
        firstSale: dates[0],
        lastSale: dates[dates.length - 1],
        likelyDate: wednesdayOnOrAfter(dates[dates.length - 1]),
      };
    });

  // Check the report against itself.
  const mismatches: string[] = [];
  for (const [c, list] of byCode) {
    const want = codeTotals.get(c);
    const fees = r2(list.reduce((s, x) => s + x.fee, 0));
    if (!want) mismatches.push(`${c}: no total on the report`);
    else if (want.count !== list.length || Math.abs(want.fees - fees) > 0.005)
      mismatches.push(`${c}: ${list.length} tickets for $${fees.toFixed(2)} read, the report's total is ${want.count} for $${want.fees.toFixed(2)}`);
  }
  const fees = r2(sales.reduce((s, x) => s + x.fee, 0));
  if (grandCount != null && grandCount !== sales.length) mismatches.push(`${sales.length} tickets read, the report's grand total is ${grandCount}`);
  if (grandFees != null && Math.abs(grandFees - fees) > 0.005) mismatches.push(`Fees add to $${fees.toFixed(2)}, the report's grand total is $${grandFees.toFixed(2)}`);
  const receipts = new Set(sales.map((s) => s.receipt)).size;
  if (transactions != null && transactions !== receipts) mismatches.push(`${receipts} receipts read, the report says ${transactions} transactions`);
  if (ticketsWithTransaction != null && ticketsWithTransaction !== byCode.size)
    mismatches.push(`${byCode.size} ticket codes read, the report says ${ticketsWithTransaction}`);
  if (!sales.length) mismatches.push("No tickets found on the report");

  const notes: string[] = [];
  const odd = sales.filter((s) => Math.abs(s.fee - s.discount - s.net) > 0.005);
  if (odd.length) {
    const extra = r2(odd.reduce((s, x) => s + x.net - (x.fee - x.discount), 0));
    notes.push(
      `${odd.length} ticket${odd.length === 1 ? " shows" : "s show"} a fee that doesn't match the net paid (${odd
        .slice(0, 3)
        .map((s) => `${s.ticketCode} #${s.serial} on ${s.date}: fee $${s.fee.toFixed(2)}, net $${s.net.toFixed(2)}`)
        .join("; ")}). Sales use the net paid, so they come to $${Math.abs(extra).toFixed(2)} ${extra > 0 ? "more" : "less"} than the report's fee total.`,
    );
  }

  return {
    title: `${lastDescription} tickets`,
    runDate,
    sales,
    events,
    grandCount,
    grandFees,
    transactions,
    ticketsWithTransaction,
    mismatches,
    notes,
  };
}

/** The tickets as a flash report: one $10 "item" per ticket, so they save as restaurant sales. */
export function ticketsAsFlash(t: TicketReport): FlashReport {
  const description = new Map(t.events.map((e) => [e.ticketCode, e.description]));
  const sales: FlashSale[] = t.sales.map((s) => ({
    date: s.date,
    receipt: s.receipt,
    user: s.user,
    inventoryCode: s.ticketCode,
    description: `${description.get(s.ticketCode) ?? "Ticket"} ticket`,
    qty: 1,
    fee: s.fee,
    discount: s.discount,
    tax: 0,
    net: s.net,
  }));
  const dayTotals = new Map<string, number>();
  for (const s of sales) dayTotals.set(s.date, r2((dayTotals.get(s.date) ?? 0) + s.net));
  const dates = [...dayTotals.keys()].sort();
  return {
    title: t.title,
    category: TICKET_CATEGORY,
    begin: dates[0] ?? null,
    end: dates[dates.length - 1] ?? null,
    sales,
    dayTotals,
    grandTotal: r2(sales.reduce((s, x) => s + x.net, 0)),
    transactions: t.transactions,
    mismatches: t.mismatches,
  };
}
