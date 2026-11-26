"use client";

// The General Ledger and Trial Balance of a car company, as QuickBooks
// shows them. The postings come from sale-service and expense-service
// (GET /ledger/lines), each transaction a balanced double entry worked out
// from the records the business already keeps (see the services' routes/
// ledger.py for which record posts to which accounts). This file holds the
// chart of accounts, builds the reports and exports them.

import { saleRequest } from "@/lib/sale-api";
import { expenseRequest } from "@/lib/expense-api";
import { companySheet, getPrintShop, imageForPdf, pdfCompanyHeader, periodText } from "@/lib/print-shop";
import { stampPdf } from "@/lib/printed-doc";

export interface LedgerLine {
  txn: string; date: string; type: string; num: string; name: string; memo: string;
  account: string; debit: number; credit: number; currency: string;
}

export type AccountType = "bank" | "ar" | "liability" | "equity" | "income" | "cogs" | "expense";
export interface Account { code: string; type: AccountType; name: Record<string, string> }

const A = (code: string, type: AccountType, en: string, fr: string, rw: string, sw: string, zh: string): Account =>
  ({ code, type, name: { en, fr, rw, sw, zh } });

/** The chart of accounts. Codes match the services' ledger.py. */
export const ACCOUNTS: Account[] = [
  A("1000", "bank", "Cash on Hand", "Caisse", "Amafaranga mu ntoki", "Fedha taslimu", "库存现金"),
  A("1010", "bank", "Bank Accounts", "Comptes bancaires", "Konti za banki", "Akaunti za benki", "银行存款"),
  A("1020", "bank", "MTN Mobile Money", "MTN Mobile Money", "MTN Mobile Money", "MTN Mobile Money", "MTN 移动钱包"),
  A("1030", "bank", "Airtel Money", "Airtel Money", "Airtel Money", "Airtel Money", "Airtel 移动钱包"),
  A("1100", "ar", "Accounts Receivable (A/R)", "Comptes clients", "Abatwishyuza (amadeni)", "Wadaiwa", "应收账款"),
  A("2000", "liability", "Customer Deposits (Vehicle Bookings)", "Acomptes clients (réservations)", "Avansi z'abakiriya (imodoka zafashwe)", "Amana za wateja (magari)", "客户订金（车辆预订）"),
  A("2100", "liability", "Rental Security Deposits", "Cautions de location", "Kosiyo z'ubukode", "Amana za kukodisha", "租车押金"),
  A("3000", "equity", "Opening Balance Equity", "Capitaux d'ouverture", "Imari y'itangiriro", "Mtaji wa salio la mwanzo", "期初余额权益"),
  A("4000", "income", "Vehicle Sales", "Ventes de véhicules", "Imodoka zagurishijwe", "Mauzo ya magari", "车辆销售收入"),
  A("4100", "income", "Rental Income", "Revenus de location", "Amafaranga y'ubukode", "Mapato ya kukodisha", "租赁收入"),
  A("4200", "income", "Service Income", "Revenus de services", "Amafaranga ya serivisi", "Mapato ya huduma", "服务收入"),
  A("4300", "income", "Commission Income", "Commissions reçues", "Komisiyo", "Mapato ya kamisheni", "佣金收入"),
  A("4400", "income", "Transport Income", "Revenus de transport", "Amafaranga y'ubwikorezi", "Mapato ya usafiri", "运输收入"),
  A("4500", "income", "Interest Income", "Intérêts reçus", "Inyungu ku mafaranga", "Mapato ya riba", "利息收入"),
  A("4800", "income", "Other Income", "Autres revenus", "Andi mafaranga yinjiye", "Mapato mengine", "其他收入"),
  A("5100", "cogs", "Vehicle Import Costs", "Coûts d'importation des véhicules", "Ibyatanzwe ku gutumiza imodoka", "Gharama za kuagiza magari", "车辆进口成本"),
  A("6010", "expense", "Rent Expense", "Loyer", "Ubukode bw'inzu", "Kodi ya pango", "租金"),
  A("6020", "expense", "Utilities", "Eau, électricité, internet", "Amazi, amashanyarazi, interineti", "Huduma (maji, umeme)", "水电网费"),
  A("6030", "expense", "Salaries & Wages", "Salaires", "Imishahara", "Mishahara", "工资薪金"),
  A("6040", "expense", "Office Supplies", "Fournitures", "Ibikoresho", "Vifaa vya ofisi", "办公用品"),
  A("6050", "expense", "Repairs & Maintenance", "Entretien et réparations", "Gusana no kwita ku bikoresho", "Matengenezo", "维修保养"),
  A("6060", "expense", "Advertising & Marketing", "Publicité et marketing", "Kwamamaza", "Matangazo", "广告营销"),
  A("6070", "expense", "Transport & Travel", "Transport et déplacements", "Ingendo n'ubwikorezi", "Usafiri", "交通差旅"),
  A("6080", "expense", "Taxes & Licenses", "Impôts et licences", "Imisoro n'impushya", "Kodi na leseni", "税费及执照"),
  A("6090", "expense", "Other Expenses", "Autres charges", "Ibindi byasohotse", "Matumizi mengine", "其他费用"),
];
const BY_CODE = new Map(ACCOUNTS.map((a) => [a.code, a]));
const DEBIT_NORMAL = new Set<AccountType>(["bank", "ar", "cogs", "expense"]);

export const TYPE_LABEL: Record<AccountType, string> = {
  bank: "Bank", ar: "Accounts receivable (A/R)", liability: "Other Current Liabilities", equity: "Equity",
  income: "Income", cogs: "Cost of Goods Sold", expense: "Expenses",
};
export const TXN_LABEL: Record<string, string> = {
  sale: "Sale", deposit: "Customer Deposit", payment: "Payment", debt: "Journal Entry",
  rental_deposit: "Rental Deposit", rental_return: "Rental Return", expense: "Expense", income: "Income",
};

export function accountOf(code: string): Account {
  return BY_CODE.get(code) ?? { code, type: "expense", name: { en: `Account ${code}` } };
}
export function accountName(code: string, lang = "en"): string {
  const a = accountOf(code);
  return `${a.code} · ${a.name[lang] ?? a.name.en}`;
}

/** Every posting up to [to] (all history, for the opening balances). */
export async function loadLedger(to: string): Promise<{ lines: LedgerLine[]; warnings: string[] }> {
  const q = to ? `?to=${encodeURIComponent(to)}` : "";
  const [s, e] = await Promise.all([saleRequest(`/ledger/lines${q}`), expenseRequest(`/ledger/lines${q}`)]);
  const lines: LedgerLine[] = [...(s?.data?.lines ?? []), ...(e?.data?.lines ?? [])];
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.txn.localeCompare(b.txn));
  return { lines, warnings: [...(s?.data?.warnings ?? []), ...(e?.data?.warnings ?? [])] };
}

export interface GLRow extends LedgerLine { split: string; balance: number }
export interface GLAccount {
  account: Account; opening: number; rows: GLRow[]; debit: number; credit: number; closing: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** A balance as the account shows it: debits up for assets and costs,
 *  credits up for liabilities, equity and income. */
const natural = (a: Account, debitMinusCredit: number) => (DEBIT_NORMAL.has(a.type) ? debitMinusCredit : -debitMinusCredit);

/** The General Ledger for [from]..[to]: each account with its beginning
 *  balance, its transactions with a running balance, and its total. */
export function generalLedger(lines: LedgerLine[], from: string, to: string, lang = "en"): GLAccount[] {
  const accountsInTxn = new Map<string, Set<string>>();
  for (const l of lines) {
    if (!accountsInTxn.has(l.txn)) accountsInTxn.set(l.txn, new Set());
    accountsInTxn.get(l.txn)!.add(l.account);
  }
  const split = (l: LedgerLine) => {
    const others = [...(accountsInTxn.get(l.txn) ?? [])].filter((c) => c !== l.account);
    return others.length === 1 ? accountName(others[0], lang) : others.length > 1 ? "-Split-" : "";
  };
  const out = new Map<string, GLAccount>();
  const get = (code: string) => {
    if (!out.has(code)) out.set(code, { account: accountOf(code), opening: 0, rows: [], debit: 0, credit: 0, closing: 0 });
    return out.get(code)!;
  };
  for (const l of lines) {
    if (to && l.date > to) continue;
    const g = get(l.account);
    if (from && l.date < from) { g.opening = r2(g.opening + natural(g.account, l.debit - l.credit)); continue; }
    g.debit = r2(g.debit + l.debit);
    g.credit = r2(g.credit + l.credit);
    g.rows.push({ ...l, split: split(l), balance: 0 });
  }
  for (const g of out.values()) {
    let bal = g.opening;
    for (const row of g.rows) { bal = r2(bal + natural(g.account, row.debit - row.credit)); row.balance = bal; }
    g.closing = bal;
  }
  return [...out.values()].filter((g) => g.rows.length || g.opening).sort((a, b) => a.account.code.localeCompare(b.account.code));
}

export interface TBRow { account: Account; debit: number; credit: number }
/** The Trial Balance as of [to]: each account's balance in its debit or
 *  credit column; the two totals are equal when the books balance. */
export function trialBalance(lines: LedgerLine[], to: string): { rows: TBRow[]; debit: number; credit: number } {
  const net = new Map<string, number>();
  for (const l of lines) if (!to || l.date <= to) net.set(l.account, r2((net.get(l.account) ?? 0) + l.debit - l.credit));
  const rows = [...net.entries()].filter(([, v]) => v !== 0)
    .map(([code, v]) => ({ account: accountOf(code), debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 }))
    .sort((a, b) => a.account.code.localeCompare(b.account.code));
  return { rows, debit: r2(rows.reduce((s, r) => s + r.debit, 0)), credit: r2(rows.reduce((s, r) => s + r.credit, 0)) };
}

const fmt = (n: number) => (n ? n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "");
const memoOf = (r: LedgerLine, currency: string) => r.memo + (r.currency && r.currency !== currency ? ` (${r.currency})` : "");
const stamp = () => new Date().toISOString().slice(0, 10);

// ── Excel ───────────────────────────────────────────────────────────────

export async function exportLedgerExcel(gl: GLAccount[], tb: ReturnType<typeof trialBalance>, p: { from: string; to: string; currency: string }) {
  const XLSX = await import("xlsx");
  const shop = await getPrintShop();
  const rows: Record<string, unknown>[] = [];
  const blank = { Date: "", "Transaction type": "", "No.": "", Name: "", "Memo/Description": "", Split: "" };
  for (const g of gl) {
    rows.push({ ...blank, Date: accountName(g.account.code), Debit: "", Credit: "", Balance: "" });
    rows.push({ ...blank, "Memo/Description": "Beginning Balance", Debit: "", Credit: "", Balance: g.opening });
    for (const r of g.rows) rows.push({
      Date: r.date, "Transaction type": TXN_LABEL[r.type] ?? r.type, "No.": r.num, Name: r.name,
      "Memo/Description": memoOf(r, p.currency), Split: r.split, Debit: r.debit || "", Credit: r.credit || "", Balance: r.balance,
    });
    rows.push({ ...blank, Date: `Total for ${accountName(g.account.code)}`, Debit: g.debit, Credit: g.credit, Balance: g.closing });
    rows.push({});
  }
  const sub = `${periodText(p.from, p.to)}  |  Amounts in ${p.currency}  |  Accrual basis`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, companySheet(XLSX, shop, "General Ledger", sub, rows), "General Ledger");
  const tbRows: Record<string, unknown>[] = tb.rows.map((r) => ({
    Account: accountName(r.account.code), Type: TYPE_LABEL[r.account.type], Debit: r.debit || "", Credit: r.credit || "",
  }));
  tbRows.push({ Account: "TOTAL", Type: "", Debit: tb.debit, Credit: tb.credit });
  XLSX.utils.book_append_sheet(wb, companySheet(XLSX, shop, "Trial Balance", `As of ${p.to || stamp()}  |  Amounts in ${p.currency}`, tbRows), "Trial Balance");
  XLSX.writeFile(wb, `general_ledger_${p.from || "start"}_${p.to || stamp()}.xlsx`);
}

// ── PDF ─────────────────────────────────────────────────────────────────

export async function exportLedgerPdf(gl: GLAccount[], tb: ReturnType<typeof trialBalance>, p: { from: string; to: string; currency: string; view: "gl" | "tb" }) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: p.view === "gl" ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const shop = await getPrintShop();
  const logo = await imageForPdf(shop.logo_url);
  const ink: [number, number, number] = [22, 36, 58];
  const soft: [number, number, number] = [235, 242, 253];
  const n = (v: number) => fmt(v);

  if (p.view === "gl") {
    const startY = pdfCompanyHeader(doc, shop, logo, "General Ledger", `${periodText(p.from, p.to)}  |  ${p.currency}  |  Accrual basis`);
    type Cell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
    const body: Cell[][] = [];
    for (const g of gl) {
      body.push([{ content: accountName(g.account.code), colSpan: 9, styles: { fontStyle: "bold", fillColor: soft, textColor: ink } }]);
      body.push(["", "", "", "", "Beginning Balance", "", "", "", n(g.opening) || "0"]);
      for (const r of g.rows) body.push([r.date, TXN_LABEL[r.type] ?? r.type, r.num, r.name, memoOf(r, p.currency), r.split, n(r.debit), n(r.credit), n(r.balance) || "0"]);
      body.push([{ content: `Total for ${accountName(g.account.code)}`, colSpan: 6, styles: { fontStyle: "bold" } },
        { content: n(g.debit), styles: { fontStyle: "bold" } }, { content: n(g.credit), styles: { fontStyle: "bold" } },
        { content: n(g.closing) || "0", styles: { fontStyle: "bold" } }]);
    }
    autoTable(doc, {
      startY,
      head: [["Date", "Transaction type", "No.", "Name", "Memo/Description", "Split", "Debit", "Credit", "Balance"]],
      body,
      styles: { fontSize: 6.8, cellPadding: 1.4, overflow: "linebreak" },
      headStyles: { fillColor: ink, textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 24 }, 2: { cellWidth: 16 }, 3: { cellWidth: 30 }, 5: { cellWidth: 38 },
        6: { halign: "right", cellWidth: 24 }, 7: { halign: "right", cellWidth: 24 }, 8: { halign: "right", cellWidth: 26 } },
      margin: { left: 10, right: 10 },
    });
  } else {
    const startY = pdfCompanyHeader(doc, shop, logo, "Trial Balance", `As of ${p.to || stamp()}  |  ${p.currency}`);
    autoTable(doc, {
      startY,
      head: [["Account", "Type", "Debit", "Credit"]],
      body: tb.rows.map((r) => [accountName(r.account.code), TYPE_LABEL[r.account.type], n(r.debit), n(r.credit)]),
      foot: [["TOTAL", "", n(tb.debit) || "0", n(tb.credit) || "0"]],
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: ink, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: ink, textColor: 255, fontStyle: "bold" },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
  }
  await stampPdf(doc, {
    kind: "ledger", title: p.view === "gl" ? "General Ledger" : "Trial Balance",
    period_from: p.view === "gl" ? p.from || null : null, period_to: p.to || null,
    records: p.view === "gl" ? gl.reduce((s, g) => s + g.rows.length, 0) : tb.rows.length, currency: p.currency,
  });
  doc.save(`${p.view === "gl" ? "general_ledger" : "trial_balance"}_${p.to || stamp()}.pdf`);
}
