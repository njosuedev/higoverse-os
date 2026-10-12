"use client";

// Who owes the business money, on a phone: the Android app's Debts screen
// (apps/mobile/lib/src/screens/debts_screen.dart and its debt sheet) —
// outstanding or paid off, the total owed, then each debtor with what is
// left and how much is paid. A debt opens its sheet: record a payment
// (the website's form), call or text the customer.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, CloudOff, MessageCircle, Phone, Wallet, WalletCards } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { saleRequest } from "@/lib/sale-api";
import { full } from "./PhoneOr";
import {
  EmptyState, Fab, IconAvatar, InfoRow, ListSkeleton, Meter, Segmented, Sheet,
  hhmm, money, num, parseTimestamp, shortDate, tf,
} from "./kit";

type Row = Record<string, unknown>;

const initials = (name: string) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function MobileDebts() {
  const { t, lang } = useLanguage();
  const { currency } = useShopSettings();
  const [paid, setPaid] = useState(false);
  const [items, setItems] = useState<Row[] | null>(null);
  const [outstanding, setOutstanding] = useState(0);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);
  const gen = useRef(0);

  const load = useCallback(async (p: boolean) => {
    const g = ++gen.current;
    setItems(null); setError(false);
    try {
      const res = await saleRequest(`/debts?is_paid=${p}`);
      if (g !== gen.current) return;
      const data = (res?.data ?? {}) as Row;
      setItems(Array.isArray(data.items) ? (data.items as Row[]) : []);
      setOutstanding(num(data.total_outstanding));
    } catch {
      if (g === gen.current) setError(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(paid), 0);
    return () => clearTimeout(first);
  }, [paid, load]);

  return (
    <main className="pb-24">
      {/* The app opens Debts as its own page, with a back arrow. */}
      <div className="flex items-center gap-2 bg-paper px-1 pt-1">
        <Link href="/business" aria-label={t("common.back")} className="flex h-11 w-11 items-center justify-center rounded-full active:bg-paper-dim">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-[20px] font-bold text-text">{t("debts.title")}</h1>
      </div>
      <div className="bg-paper px-2.5 pb-2 pt-1">
        <Segmented value={paid ? "paid" : "open"} onChange={(v) => setPaid(v === "paid")}
          options={[{ value: "open", label: t("debts.outstanding") }, { value: "paid", label: t("debts.paid") }]} />
      </div>
      <div className="border-t border-border" />

      {error && items == null ? (
        <EmptyState icon={<CloudOff size={40} />} message={t("dash.offline")} onRetry={() => void load(paid)} retry={t("app.retry")} />
      ) : items == null ? (
        <ListSkeleton count={8} />
      ) : (
        <div className="px-2 pt-2">
          {!paid && (
            <div className="flex items-center gap-3.5 rounded-xl border border-border bg-white p-4">
              <IconAvatar icon={<Wallet size={22} />} color="var(--color-warning)" size={46} />
              <div className="min-w-0">
                <p className="font-semibold text-text-muted">{t("debts.total_owed")}</p>
                <p className="truncate text-[24px] font-black text-text">{money(outstanding, currency)}</p>
                <p className="text-[13px] text-text-faint">{tf(t, "dash.owed_detail", { n: items.length })}</p>
              </div>
            </div>
          )}
          {items.length === 0 ? (
            <EmptyState icon={<BadgeCheck size={40} />} message={paid ? t("debts.none_paid") : t("debts.none")} />
          ) : (
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-white">
              {items.map((d, i) => {
                const owed = num(d.amount_owed), got = num(d.amount_paid);
                const balance = d.balance == null ? owed - got : num(d.balance);
                const settled = d.is_paid === true;
                const when = parseTimestamp(d.created_at);
                return (
                  <button key={String(d.id)} type="button" onClick={() => setOpen(d)}
                    className={`flex w-full items-center gap-3.5 px-3 py-2.5 text-left active:bg-paper-dim ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-soft font-bold text-ink">{initials(String(d.debtor_name ?? ""))}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-bold text-text">{String(d.debtor_name ?? "")}</span>
                        <span className={`font-extrabold ${settled ? "text-success" : "text-warning"}`}>{money(settled ? owed : balance, currency)}</span>
                      </span>
                      <span className="mt-1.5 block"><Meter value={owed <= 0 ? 1 : got / owed} /></span>
                      <span className="mt-1 block truncate text-[12px] text-text-faint">
                        {[String(d.phone ?? "").trim(), when ? `${shortDate(lang, when)}, ${hhmm(when)}` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Fab href={full("/sales", { debt: "new" })} label={t("form.new_debt")} />
      <DebtSheet debt={open} onClose={() => setOpen(null)} />
    </main>
  );
}

/** One debt: who, how much is left, and quick ways to reach them. */
function DebtSheet({ debt, onClose }: { debt: Row | null; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const { currency } = useShopSettings();
  if (!debt) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const owed = num(debt.amount_owed), got = num(debt.amount_paid);
  const balance = debt.balance == null ? owed - got : num(debt.balance);
  const phone = String(debt.phone ?? "").trim();
  const settled = debt.is_paid === true;
  const since = parseTimestamp(debt.created_at);
  return (
    <Sheet open onClose={onClose}>
      <div className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink-soft text-lg font-bold text-ink">{initials(String(debt.debtor_name ?? ""))}</span>
        <div className="min-w-0">
          <p className="truncate text-[20px] font-extrabold tracking-[-0.3px] text-text">{String(debt.debtor_name ?? "")}</p>
          {phone && <p className="font-medium text-text-faint">{phone}</p>}
        </div>
      </div>
      <div className="mt-[18px] rounded-[14px] bg-paper p-4">
        <p className={`font-bold ${settled ? "text-success" : "text-text-muted"}`}>{settled ? t("debts.settled") : t("debts.balance")}</p>
        <p className={`mt-1 truncate text-[28px] font-black ${settled ? "text-success" : "text-warning"}`}>{money(balance, currency)}</p>
        <div className="mt-3"><Meter value={owed <= 0 ? 1 : got / owed} height={8} /></div>
        <p className="mt-1.5 text-[13px] text-text-faint">{tf(t, "debts.paid_of", { paid: money(got, currency), owed: money(owed, currency) })}</p>
      </div>
      <div className="mt-2">
        <InfoRow label={t("debts.owed")} value={money(owed, currency)} />
        <InfoRow label={t("sale.paid")} value={money(got, currency)} />
        {since && <InfoRow label={t("debts.since")} value={`${shortDate(lang, since)}, ${hhmm(since)}`} />}
        {String(debt.notes ?? "").trim() && <InfoRow label={t("sale.notes")} value={String(debt.notes)} />}
      </div>
      {!settled && balance > 0 && (
        <Link href={full("/sales", { pay: String(debt.id) })}
          className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-success font-bold text-white">
          <WalletCards size={18} /> {t("form.record_payment")}
        </Link>
      )}
      {phone && (
        <div className="mt-4 flex gap-2.5">
          <a href={`tel:${phone}`} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink font-bold text-white"><Phone size={18} /> {t("debts.call")}</a>
          <a href={`sms:${phone}`} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border font-bold text-text"><MessageCircle size={18} /> {t("debts.sms")}</a>
        </div>
      )}
    </Sheet>
  );
}
