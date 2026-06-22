"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { saleRequest } from "@/lib/sale-api";
import { settingsRequest } from "@/lib/settings-api";
import { useDebounce } from "@/lib/hooks";
import { useLanguage } from "@/lib/language-context";
import PageSkeleton from "@/app/components/dashboard/PageSkeleton";
import Pagination from "@/app/components/ui/Pagination";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  ShoppingBag, Search, Filter, Plus, Trash2, Pencil, X,
  TrendingUp, DollarSign, Users, ReceiptText, Package, RefreshCw, Calendar, Printer,
  Wallet, AlertCircle, CheckCircle2, Phone, ChevronDown,
} from "lucide-react";

interface Sale {
  id: string; product_id: string; product_name?: string;
  customer_id?: string; quantity: number; unit_price: number;
  total_amount: number; profit?: number; notes?: string;
  payment_method?: string; amount_paid?: number;
  created_at?: string;
}
interface Product { id: string; name: string; selling_price: number; cost_price: number; quantity: number; }
interface Partner { id: string; name: string; phone?: string; address?: string; }
interface LineItem { id: string; product_id: string; quantity: number; unit_price: number; }
interface Debt {
  id: string; debtor_name: string; phone?: string;
  amount_owed: number; amount_paid: number; balance: number;
  notes?: string; is_paid: boolean; sale_id?: string; created_at?: string;
}

type ModalMode = "create" | "edit";
type PaymentMethod = "cash" | "mtn" | "airtel" | "bank" | "card" | "debt";

const EMPTY_FORM = { product_id: "", customer_id: "", quantity: "", unit_price: "", notes: "" };
const PAGE_SIZES = [25, 50, 100, 250];
const PAYMENT_METHODS: { value: PaymentMethod; label: string; color: string }[] = [
  { value: "cash",   label: "Cash",        color: "bg-green-100 text-green-700 border-green-200" },
  { value: "mtn",    label: "MTN",         color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "airtel", label: "Airtel",      color: "bg-red-100 text-red-700 border-red-200" },
  { value: "bank",   label: "Bank",        color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "card",   label: "Debit Card",  color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "debt",   label: "Debt",        color: "bg-orange-100 text-orange-700 border-orange-200" },
];

function paymentBadge(method?: string) {
  const m = PAYMENT_METHODS.find((p) => p.value === method) || PAYMENT_METHODS[0];
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${m.color}`}>{m.label}</span>;
}

function genId() { return Math.random().toString(36).slice(2, 9); }
function emptyLine(): LineItem { return { id: genId(), product_id: "", quantity: 1, unit_price: 0 }; }
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SaleManagementPage() {
  const { t } = useLanguage();

  const [sales, setSales] = useState<Sale[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => toDateStr(new Date()));
  const [dateTo, setDateTo] = useState(() => toDateStr(new Date()));
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);

  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [saleCustomer, setSaleCustomer] = useState("");
  const [saleNotes, setSaleNotes] = useState("");

  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountSent, setAmountSent] = useState("");
  const [debtorName, setDebtorName] = useState("");
  const [debtorPhone, setDebtorPhone] = useState("");

  const [shopName, setShopName] = useState("");
  const [currency, setCurrency] = useState("RWF");

  const [receipts, setReceipts] = useState<Sale[]>([]);

  // Debts state
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtsLoading, setDebtsLoading] = useState(false);
  const [debtsTotalOutstanding, setDebtsTotalOutstanding] = useState(0);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [debtForm, setDebtForm] = useState({ debtor_name: "", phone: "", amount_owed: "", amount_paid: "0", notes: "" });
  const [debtSubmitting, setDebtSubmitting] = useState(false);
  const [payingDebtId, setPayingDebtId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [showPayModal, setShowPayModal] = useState<Debt | null>(null);
  const [deletingDebtId, setDeletingDebtId] = useState("");

  const loadDataRef = useRef<(soft?: boolean) => Promise<void>>(async () => {});
  useEffect(() => { loadDataRef.current = loadData; });

  useEffect(() => {
    const timer = setInterval(() => loadDataRef.current(true), 30_000);
    return () => clearInterval(timer);
  }, []);

  const debouncedSearch = useDebounce(search, 350);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); loadDebts(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) loadData(true); }, [dateFrom, dateTo, page, pageSize]);

  async function loadData(soft = false) {
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      const params = new URLSearchParams({
        page: String(page), limit: String(pageSize),
        ...(dateFrom && { from_date: dateFrom }),
        ...(dateTo && { to_date: dateTo }),
      });
      const [salesRes, productsRes, partnersRes, settingsRes] = await Promise.all([
        saleRequest(`/sales?${params}`),
        itemRequest("/products?limit=500"),
        partnerRequest("/suppliers"),
        settingsRequest("/settings").catch(() => null),
      ]);
      setSales(salesRes?.data?.items || []);
      setSalesTotal(salesRes?.data?.total || 0);
      setProducts(productsRes?.data?.items || []);
      const all: Partner[] = partnersRes?.data?.items || partnersRes?.data || [];
      setCustomers(all.filter((p) => !p.address?.startsWith("TIN:")));
      if (settingsRes?.data) {
        if (settingsRes.data.shop_name) setShopName(settingsRes.data.shop_name);
        if (settingsRes.data.currency) setCurrency(settingsRes.data.currency);
      }
      setLastUpdated(new Date());
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }

  async function loadDebts() {
    try {
      setDebtsLoading(true);
      const res = await saleRequest("/debts");
      setDebts(res?.data?.items || []);
      setDebtsTotalOutstanding(res?.data?.total_outstanding || 0);
    } catch { /* non-fatal */ }
    finally { setDebtsLoading(false); }
  }

  function openCreateModal() {
    setLineItems([emptyLine()]); setSaleCustomer(""); setSaleNotes("");
    setPaymentMethod("cash"); setAmountSent(""); setDebtorName(""); setDebtorPhone("");
    setEditingId(null); setModalMode("create"); setShowModal(true);
  }
  function openEditModal(s: Sale) {
    setForm({ product_id: s.product_id, customer_id: s.customer_id || "", quantity: String(s.quantity), unit_price: String(s.unit_price), notes: s.notes || "" });
    setEditingId(s.id); setModalMode("edit"); setShowModal(true);
  }
  function closeModal() {
    setShowModal(false); setForm(EMPTY_FORM); setEditingId(null);
    setLineItems([emptyLine()]); setSaleCustomer(""); setSaleNotes("");
    setPaymentMethod("cash"); setAmountSent(""); setDebtorName(""); setDebtorPhone("");
  }

  function addLine() { setLineItems((prev) => [...prev, emptyLine()]); }
  function removeLine(id: string) { setLineItems((prev) => prev.filter((l) => l.id !== id)); }
  function setLineProduct(id: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    setLineItems((prev) => prev.map((l) => l.id === id ? { ...l, product_id: productId, unit_price: p ? p.selling_price : l.unit_price } : l));
  }
  function setLineQty(id: string, qty: number) {
    setLineItems((prev) => prev.map((l) => l.id === id ? { ...l, quantity: Math.max(1, qty) } : l));
  }
  function setLinePrice(id: string, price: number) {
    setLineItems((prev) => prev.map((l) => l.id === id ? { ...l, unit_price: Math.max(0, price) } : l));
  }

  function onProductChange(productId: string) {
    const product = products.find((p) => p.id === productId);
    setForm((f) => ({ ...f, product_id: productId, unit_price: product ? String(product.selling_price) : f.unit_price }));
  }

  async function submitForm() {
    if (modalMode === "edit" && editingId) {
      if (!form.product_id || !form.quantity || !form.unit_price) {
        alert(t("sales.product") + ", " + t("sales.quantity") + " & " + t("sales.unit_price") + " required."); return;
      }
      const payload = {
        product_id: form.product_id, customer_id: form.customer_id || undefined,
        quantity: Number(form.quantity), unit_price: Number(form.unit_price),
        notes: form.notes.trim() || undefined,
      };
      try {
        setSubmitting(true);
        await saleRequest(`/sales/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        closeModal(); await loadData(true);
      } catch (err: unknown) { alert(err instanceof Error ? err.message : "Error"); }
      finally { setSubmitting(false); }
      return;
    }

    const validLines = lineItems.filter((l) => l.product_id && l.quantity > 0 && l.unit_price >= 0);
    if (validLines.length === 0) { alert("Add at least one item with a product selected."); return; }
    if (paymentMethod === "debt" && !debtorName.trim()) { alert("Enter the debtor’s name."); return; }

    const grandTotal = validLines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

    try {
      setSubmitting(true);
      const created: Sale[] = [];
      const errors: string[] = [];

      for (const line of validLines) {
        try {
          const res = await saleRequest("/sales", {
            method: "POST",
            body: JSON.stringify({
              product_id: line.product_id,
              customer_id: saleCustomer || undefined,
              quantity: line.quantity,
              unit_price: line.unit_price,
              notes: saleNotes.trim() || undefined,
              payment_method: paymentMethod,
              amount_paid: amountSent ? Number(amountSent) : (paymentMethod === "debt" ? 0 : undefined),
            }),
          });
          if (res?.data?.id) created.push(res.data);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Unknown error");
        }
      }

      if (paymentMethod === "debt" && created.length > 0) {
        try {
          await saleRequest("/debts", {
            method: "POST",
            body: JSON.stringify({
              debtor_name: debtorName.trim(),
              phone: debtorPhone.trim() || undefined,
              amount_owed: grandTotal,
              amount_paid: 0,
              notes: saleNotes.trim() || undefined,
              sale_id: created[0]?.id,
            }),
          });
          await loadDebts();
        } catch { /* non-fatal */ }
      }

      closeModal();
      if (created.length > 0) setReceipts(created);
      if (errors.length > 0) alert(`Some items failed:\n${errors.join("\n")}`);
      await loadData(true);
    } finally { setSubmitting(false); }
  }

  async function deleteSale(id: string) {
    if (!confirm(t("common.confirm_delete"))) return;
    try {
      setDeletingId(id);
      await saleRequest(`/sales/${id}`, { method: "DELETE" });
      await loadData(true);
    } catch { alert("Delete failed."); }
    finally { setDeletingId(""); }
  }

  async function submitDebt() {
    if (!debtForm.debtor_name.trim() || !debtForm.amount_owed) { alert("Name and amount owed are required."); return; }
    try {
      setDebtSubmitting(true);
      if (editingDebt) {
        await saleRequest(`/debts/${editingDebt.id}`, {
          method: "PUT",
          body: JSON.stringify({
            debtor_name: debtForm.debtor_name.trim(),
            phone: debtForm.phone.trim() || undefined,
            amount_owed: Number(debtForm.amount_owed),
            amount_paid: Number(debtForm.amount_paid),
            notes: debtForm.notes.trim() || undefined,
          }),
        });
      } else {
        await saleRequest("/debts", {
          method: "POST",
          body: JSON.stringify({
            debtor_name: debtForm.debtor_name.trim(),
            phone: debtForm.phone.trim() || undefined,
            amount_owed: Number(debtForm.amount_owed),
            amount_paid: Number(debtForm.amount_paid),
            notes: debtForm.notes.trim() || undefined,
          }),
        });
      }
      setShowDebtModal(false); setEditingDebt(null);
      setDebtForm({ debtor_name: "", phone: "", amount_owed: "", amount_paid: "0", notes: "" });
      await loadDebts();
    } catch (err: unknown) { alert(err instanceof Error ? err.message : "Error"); }
    finally { setDebtSubmitting(false); }
  }

  async function recordPayment() {
    if (!showPayModal || !paymentAmount) return;
    const newPaid = showPayModal.amount_paid + Number(paymentAmount);
    try {
      setPayingDebtId(showPayModal.id);
      await saleRequest(`/debts/${showPayModal.id}`, {
        method: "PUT",
        body: JSON.stringify({ amount_paid: newPaid }),
      });
      setShowPayModal(null); setPaymentAmount("");
      await loadDebts();
    } catch (err: unknown) { alert(err instanceof Error ? err.message : "Error"); }
    finally { setPayingDebtId(""); }
  }

  async function deleteDebt(id: string) {
    if (!confirm("Delete this debt record?")) return;
    try {
      setDeletingDebtId(id);
      await saleRequest(`/debts/${id}`, { method: "DELETE" });
      await loadDebts();
    } catch { alert("Delete failed."); }
    finally { setDeletingDebtId(""); }
  }

  function printReceiptPopup(salesToPrint: Sale[]) {
    const grandTotal = salesToPrint.reduce((s, x) => s + x.total_amount, 0);
    const receiptNo = salesToPrint[0]?.id?.slice(0, 8)?.toUpperCase() || "SALE";
    const dateStr = salesToPrint[0]?.created_at
      ? new Date(salesToPrint[0].created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
      : new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    const customerName = salesToPrint[0]?.customer_id ? customerMap[salesToPrint[0].customer_id]?.name : "";
    const pm = salesToPrint[0]?.payment_method;
    const paid = salesToPrint[0]?.amount_paid;
    const change = paid && paid > grandTotal ? paid - grandTotal : 0;

    const itemsHtml = salesToPrint.map((s) =>
      `<tr>
        <td style="padding:6px 4px 6px 0;border-bottom:1px dotted #ddd;word-break:break-word;">${s.product_name || "Item"}</td>
        <td style="padding:6px 4px;border-bottom:1px dotted #ddd;text-align:center;white-space:nowrap;">${s.quantity}</td>
        <td style="padding:6px 4px;border-bottom:1px dotted #ddd;text-align:right;white-space:nowrap;">${s.unit_price.toLocaleString()}</td>
        <td style="padding:6px 0 6px 4px;border-bottom:1px dotted #ddd;text-align:right;font-weight:600;white-space:nowrap;">${s.total_amount.toLocaleString()}</td>
      </tr>`
    ).join("");

    const paymentHtml = pm ? `
      <hr class="dashed">
      <div class="row"><span class="label">Payment</span><span style="font-weight:700;text-transform:uppercase">${pm}</span></div>
      ${paid ? `<div class="row"><span class="label">Amount Paid</span><span>${paid.toLocaleString()} ${currency}</span></div>` : ""}
      ${change > 0 ? `<div class="row" style="color:#16a34a"><span class="label">Change</span><span style="font-weight:700">${change.toLocaleString()} ${currency}</span></div>` : ""}
      ${pm === "debt" ? `<div class="row" style="color:#dc2626"><span class="label">&#9888; ON CREDIT</span><span style="font-weight:700">${grandTotal.toLocaleString()} ${currency} OWED</span></div>` : ""}
    ` : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Receipt #${receiptNo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',Courier,monospace;background:#fff;padding:16px;max-width:320px;margin:0 auto;font-size:12px;color:#111}
  .center{text-align:center}
  .shop-name{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px}
  .dashed{border:none;border-top:1px dashed #888;margin:8px 0}
  .solid{border:none;border-top:1px solid #222;margin:8px 0}
  .row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;font-size:11px}
  .label{color:#666}
  table{width:100%;border-collapse:collapse;margin:4px 0}
  thead th{font-size:10px;text-transform:uppercase;color:#666;padding:4px 0;border-bottom:2px solid #222;text-align:right}
  thead th:first-child{text-align:left}
  .total-line{font-size:14px;font-weight:700}
  .footer-text{color:#888;font-size:10px;text-align:center;margin-top:4px}
  @media print{html,body{width:80mm;max-width:80mm;padding:4mm;margin:0}@page{size:80mm auto;margin:0}}
</style>
</head>
<body>
<div class="center" style="margin-bottom:10px">
  <div class="shop-name">${shopName || "HIGOVERSE SHOP"}</div>
  <div style="color:#666;font-size:10px;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Sales Receipt</div>
</div>
<hr class="dashed">
<div class="row"><span class="label">Receipt #</span><span style="font-weight:700">${receiptNo}</span></div>
<div class="row"><span class="label">Date</span><span>${dateStr}</span></div>
${customerName ? `<div class="row"><span class="label">Customer</span><span style="font-weight:600">${customerName}</span></div>` : ""}
<hr class="dashed">
<table>
  <thead><tr>
    <th style="text-align:left">Item</th>
    <th style="text-align:center">Qty</th>
    <th>Unit Price</th>
    <th>Total</th>
  </tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<hr class="solid">
<div class="row total-line">
  <span>GRAND TOTAL</span>
  <span>${grandTotal.toLocaleString()} ${currency}</span>
</div>
${paymentHtml}
<hr class="dashed">
<div class="footer-text" style="margin-top:12px">Thank you for your business!</div>
<div class="footer-text">Powered by Higoverse</div>
<script>window.onload=function(){setTimeout(function(){window.print();},400);};window.onafterprint=function(){window.close();};</script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=400,height=700,toolbar=no,menubar=no,scrollbars=yes,resizable=yes");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  }

  const productMap = useMemo(() => {
    const m: Record<string, Product> = {};
    products.forEach((p) => { m[p.id] = p; });
    return m;
  }, [products]);

  const customerMap = useMemo(() => {
    const m: Record<string, Partner> = {};
    customers.forEach((c) => { m[c.id] = c; });
    return m;
  }, [customers]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return sales.filter((s) => {
      const name = (s.product_name || productMap[s.product_id]?.name || "").toLowerCase();
      const cust = customerMap[s.customer_id || ""]?.name?.toLowerCase() || "";
      if (q && !name.includes(q) && !cust.includes(q) && !(s.notes || "").toLowerCase().includes(q)) return false;
      if (filter === "profit") return (s.profit || 0) > 0;
      if (filter === "loss") return (s.profit || 0) <= 0;
      if (filter.startsWith("pay:")) return (s.payment_method || "cash") === filter.slice(4);
      return true;
    });
  }, [sales, debouncedSearch, filter, productMap, customerMap]);

  const stats = useMemo(() => {
    const revenue = sales.reduce((s, x) => s + x.total_amount, 0);
    const profit = sales.reduce((s, x) => s + (x.profit || 0), 0);
    const itemsSold = sales.reduce((s, x) => s + x.quantity, 0);
    const uniqueCustomers = new Set(sales.map((x) => x.customer_id).filter(Boolean)).size;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const avgSale = sales.length > 0 ? revenue / sales.length : 0;
    const payBreakdown = PAYMENT_METHODS.reduce((acc, m) => {
      const grp = sales.filter((s) => (s.payment_method || "cash") === m.value);
      acc[m.value] = { count: grp.length, revenue: grp.reduce((s, x) => s + x.total_amount, 0) };
      return acc;
    }, {} as Record<string, { count: number; revenue: number }>);
    return { total: salesTotal, revenue, profit, itemsSold, uniqueCustomers, margin, avgSale, payBreakdown };
  }, [sales, salesTotal]);

  const createGrandTotal = lineItems.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const createGrandProfit = lineItems.reduce((s, l) => {
    const p = productMap[l.product_id];
    return s + (p ? (l.unit_price - p.cost_price) * l.quantity : 0);
  }, 0);
  const changeAmount = amountSent && Number(amountSent) > createGrandTotal ? Number(amountSent) - createGrandTotal : 0;

  const totalPages = Math.ceil(salesTotal / pageSize);
  const selectedProduct = products.find((p) => p.id === form.product_id);
  const hasDateFilter = dateFrom || dateTo;

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition";

  const pendingDebts = debts.filter((d) => !d.is_paid);

  if (loading) return <PageSkeleton cards={5} rows={7} cols={7} />;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        {/* HEADER */}
        <div className="relative rounded-2xl mb-2 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1372e6 0%, #1168d6 50%, #0a47a0 100%)" }}>
          <div style={{ position:"absolute",inset:0,pointerEvents:"none",
            backgroundImage:"radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize:"20px 20px" }} />

          {/* Row 1: icon + title + actions */}
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="flex items-center gap-2.5 min-w-0 mr-auto">
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <ShoppingBag size={15} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest leading-none">Sales</p>
                <h1 className="text-base font-extrabold text-white leading-tight tracking-tight">{t("sales.title")}</h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => loadData(true)} disabled={refreshing}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all disabled:opacity-40">
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={openCreateModal}
                className="flex items-center gap-1.5 bg-white text-[#1372e6] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 active:scale-95 transition-all shadow-lg shadow-black/20">
                <Plus size={12} strokeWidth={3} /> {t("sales.add")}
              </button>
            </div>
          </div>

          {/* Row 2: live indicator */}
          <div className="relative flex items-center gap-1.5 px-4 pb-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
            </span>
            <p className="text-[10px] text-blue-100/70">
              Live · <span className="font-semibold text-white/80">{salesTotal.toLocaleString()} sales</span>
              {lastUpdated && <span className="ml-1 text-blue-200/50">· Updated {lastUpdated.toLocaleTimeString()}</span>}
            </p>
          </div>

          {/* Row 3: search + filter + date range */}
          <div className="relative px-4 pb-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-white/10 hover:bg-white/15 focus-within:bg-white/20 border border-white/10 focus-within:border-white/30 rounded-xl px-3 py-2 transition-all group shadow-inner">
                <Search size={13} className="shrink-0 text-white/40 group-focus-within:text-white/80 transition-colors" />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder={t("items.search")}
                  className="bg-transparent outline-none w-full text-sm text-white placeholder:text-white/35 font-medium" />
                {search && (
                  <button onClick={() => setSearch("")} className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white/70 hover:text-white transition-all shrink-0">
                    <X size={9} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl px-2.5 py-2 transition-all">
                <Filter size={11} className="shrink-0 text-white/50" />
                <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}
                  className="bg-transparent outline-none text-xs text-white font-semibold appearance-none cursor-pointer">
                  <option value="all" className="text-gray-800">{t("sales.all")}</option>
                  <option value="profit" className="text-gray-800">{t("sales.profit")}</option>
                  <option value="loss" className="text-gray-800">Loss</option>
                  <optgroup label="By payment" className="text-gray-600">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={`pay:${m.value}`} className="text-gray-800">{m.label} only</option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown size={10} className="text-white/35 shrink-0" />
              </div>
            </div>
            <DateRangeFilter
              from={dateFrom} to={dateTo}
              onFrom={(v) => { setDateFrom(v); setPage(1); }}
              onTo={(v) => { setDateTo(v); setPage(1); }}
              onClear={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
              accentClass="focus:ring-[#1372e6]/30 focus:border-[#1372e6]"
            />
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 mb-2">
          {[
            { label: t("sales.count"),        value: stats.total,                                                            color: "text-[#1372e6]",  dot: "bg-[#1372e6]"  },
            { label: t("sales.revenue"),       value: stats.revenue.toLocaleString(),                                         color: "text-green-600",  dot: "bg-green-500"  },
            { label: t("sales.profit"),        value: `${stats.profit >= 0 ? "+" : ""}${stats.profit.toLocaleString()}`,      color: stats.profit >= 0 ? "text-green-700" : "text-red-500", dot: stats.profit >= 0 ? "bg-green-500" : "bg-red-500" },
            { label: t("reports.customers"),   value: stats.uniqueCustomers,                                                  color: "text-[#1372e6]",  dot: "bg-blue-400"   },
            { label: "Outstanding",            value: debtsTotalOutstanding.toLocaleString(),                                  color: "text-orange-500", dot: "bg-orange-400" },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.dot}`} />
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none truncate">{card.label}</p>
              </div>
              <p className={`text-sm font-bold leading-none tabular-nums ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* PAYMENT BREAKDOWN */}
        {sales.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-1.5 mb-2 flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">Payments</span>
            {PAYMENT_METHODS.filter((m) => (stats.payBreakdown[m.value]?.count ?? 0) > 0).map((m) => {
              const b = stats.payBreakdown[m.value];
              return (
                <div key={m.value} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] ${m.color}`}>
                  <span className="font-semibold">{m.label}</span>
                  <span className="opacity-60">·</span>
                  <span>{b.count} {b.count === 1 ? "sale" : "sales"}</span>
                  <span className="opacity-60">·</span>
                  <span className="font-semibold tabular-nums">{b.revenue.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto mb-6">
          {(debouncedSearch || filter !== "all") && (
            <div className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500 bg-slate-50">
              <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span> results
              {debouncedSearch && <> for &ldquo;<span className="font-medium">{debouncedSearch}</span>&rdquo;</>}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {[t("sales.col_date"), t("sales.col_product"), t("sales.col_customer"), "Payment", t("sales.col_qty"), t("sales.col_price"), t("sales.col_total"), "Profit / Margin", t("common.notes"), ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => {
                const product = productMap[s.product_id];
                const customer = customerMap[s.customer_id || ""];
                const isProfit = (s.profit || 0) > 0;
                const saleDate = s.created_at ? new Date(s.created_at) : null;
                return (
                  <tr key={s.id} className={`hover:bg-slate-50/60 transition-colors border-l-2 ${isProfit ? "border-l-green-400" : (s.profit || 0) < 0 ? "border-l-red-400" : "border-l-slate-200"}`}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {saleDate ? (
                        <div>
                          <p className="text-xs font-medium text-slate-700">{toDateStr(saleDate)}</p>
                          <p className="text-xs text-slate-400">{saleDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const name = s.product_name || product?.name;
                        const costPrice = product?.cost_price;
                        return name
                          ? <div>
                              <p className="font-semibold text-slate-800">{name}</p>
                              {costPrice !== undefined && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  cost {costPrice.toLocaleString()} · sell {s.unit_price.toLocaleString()}
                                </p>
                              )}
                            </div>
                          : <span className="text-slate-400 text-xs">Unknown product</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      {customer
                        ? <div><p className="font-medium text-slate-700">{customer.name}</p>{customer.phone && <p className="text-xs text-slate-400">{customer.phone}</p>}</div>
                        : <span className="text-slate-400 text-xs italic">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {paymentBadge(s.payment_method)}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-700 tabular-nums">{s.quantity}</td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">{s.unit_price.toLocaleString()}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800 tabular-nums">{s.total_amount.toLocaleString()}</td>
                    <td className={`px-3 py-2 tabular-nums ${isProfit ? "text-green-600" : "text-red-500"}`}>
                      <span className="font-semibold">{isProfit ? "+" : ""}{(s.profit || 0).toLocaleString()}</span>
                      {s.total_amount > 0 && (
                        <span className="block text-[10px] font-normal opacity-60">
                          {Math.round(((s.profit || 0) / s.total_amount) * 100)}% margin
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs max-w-28 truncate">{s.notes || <span className="text-slate-200">—</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => printReceiptPopup([s])} title="Print receipt"
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition">
                          <Printer size={14} />
                        </button>
                        <button onClick={() => openEditModal(s)}
                          className="p-1.5 rounded-lg bg-[#EBF2FD] hover:bg-[#D5E8FB] text-[#1372e6] transition">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => deleteSale(s.id)} disabled={deletingId === s.id}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length > 1 && (() => {
                const fRev = filtered.reduce((s, x) => s + x.total_amount, 0);
                const fProfit = filtered.reduce((s, x) => s + (x.profit || 0), 0);
                const fMargin = fRev > 0 ? (fProfit / fRev) * 100 : 0;
                return (
                  <tr className="bg-slate-50 border-t-2 border-slate-200 text-xs font-semibold text-slate-500">
                    <td className="px-4 py-2" colSpan={6}>Subtotal — {filtered.length} sales</td>
                    <td className="px-4 py-2 tabular-nums text-slate-700">{fRev.toLocaleString()}</td>
                    <td className={`px-4 py-2 tabular-nums ${fProfit >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {fProfit >= 0 ? "+" : ""}{fProfit.toLocaleString()}
                      <span className="block text-[10px] font-normal opacity-70">{fMargin.toFixed(1)}% margin</span>
                    </td>
                    <td colSpan={2} />
                  </tr>
                );
              })()}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="p-4 bg-slate-100 rounded-2xl mb-3"><ShoppingBag size={32} className="opacity-40" /></div>
              <p className="font-medium text-slate-500 text-sm">{t("sales.no_sales")}</p>
              {!search && filter === "all" && !hasDateFilter && (
                <button onClick={openCreateModal} className="mt-4 flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition hover:opacity-90" style={{ background: "#1372e6" }}>
                  <Plus size={14} /> {t("sales.add")}
                </button>
              )}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} total={salesTotal}
            pageSize={pageSize} pageSizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
        </div>

        {/* DEBTS SECTION */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 rounded-lg"><AlertCircle size={17} className="text-orange-500" /></div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Debts Tracker</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {pendingDebts.length} pending ·{" "}
                  <span className="text-orange-600 font-semibold">{debtsTotalOutstanding.toLocaleString()} {currency}</span> outstanding
                </p>
              </div>
            </div>
            <button
              onClick={() => { setEditingDebt(null); setDebtForm({ debtor_name: "", phone: "", amount_owed: "", amount_paid: "0", notes: "" }); setShowDebtModal(true); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
              style={{ background: "#1372e6" }}
            >
              <Plus size={13} /> Add Debt
            </button>
          </div>

          {debtsLoading ? (
            <div className="px-5 py-8 text-center text-xs text-slate-400">Loading debts…</div>
          ) : debts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <CheckCircle2 size={32} className="mb-2 text-green-300" />
              <p className="text-sm font-medium text-slate-500">No debts recorded</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {debts.map((d) => {
                const balance = d.amount_owed - d.amount_paid;
                const pct = d.amount_owed > 0 ? Math.min(100, (d.amount_paid / d.amount_owed) * 100) : 0;
                return (
                  <div key={d.id} className={`px-5 py-4 ${d.is_paid ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-800 text-sm">{d.debtor_name}</p>
                          {d.is_paid
                            ? <span className="text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded">PAID</span>
                            : <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded">PENDING</span>
                          }
                        </div>
                        {d.phone && (
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Phone size={10} />{d.phone}</p>
                        )}
                        {d.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{d.notes}</p>}
                        {d.created_at && (
                          <p className="text-[10px] text-slate-300 mt-1">{new Date(d.created_at).toLocaleDateString()}</p>
                        )}
                        <div className="mt-2.5 flex items-center gap-2.5">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">{Math.round(pct)}% paid</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">Owed</p>
                        <p className="font-bold text-slate-800 tabular-nums">{d.amount_owed.toLocaleString()}</p>
                        {d.amount_paid > 0 && (
                          <>
                            <p className="text-xs text-slate-400 mt-0.5">Paid</p>
                            <p className="text-green-600 font-semibold tabular-nums text-sm">{d.amount_paid.toLocaleString()}</p>
                          </>
                        )}
                        {!d.is_paid && (
                          <>
                            <p className="text-xs text-slate-400 mt-0.5">Balance</p>
                            <p className="text-orange-600 font-bold tabular-nums">{balance.toLocaleString()} {currency}</p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-3">
                      {!d.is_paid && (
                        <button
                          onClick={() => { setShowPayModal(d); setPaymentAmount(""); }}
                          disabled={payingDebtId === d.id}
                          className="flex items-center gap-1 text-xs font-semibold bg-green-50 hover:bg-green-100 text-green-700 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40"
                        >
                          <Wallet size={12} /> Record Payment
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingDebt(d); setDebtForm({ debtor_name: d.debtor_name, phone: d.phone || "", amount_owed: String(d.amount_owed), amount_paid: String(d.amount_paid), notes: d.notes || "" }); setShowDebtModal(true); }}
                        className="flex items-center gap-1 text-xs font-semibold bg-[#EBF2FD] hover:bg-[#D5E8FB] text-[#1372e6] px-2.5 py-1.5 rounded-lg transition"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        onClick={() => deleteDebt(d.id)}
                        disabled={deletingDebtId === d.id}
                        className="flex items-center gap-1 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CREATE MODAL */}
        {showModal && modalMode === "create" && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{t("sales.add_title")}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Add one or more items to this sale</p>
                </div>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>

              <div className="px-6 py-4 overflow-y-auto flex-1">

                {/* Customer + Notes */}
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("sales.customer")}</label>
                    <select className={inputCls} value={saleCustomer} onChange={(e) => setSaleCustomer(e.target.value)}>
                      <option value="">— Walk-in customer —</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("common.notes")}</label>
                    <input className={inputCls} placeholder="Optional note for this sale..."
                      value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} />
                  </div>
                </div>

                {/* Payment Method */}
                <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2.5">
                    Payment Method
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => { setPaymentMethod(m.value); setAmountSent(""); setDebtorName(""); setDebtorPhone(""); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          paymentMethod === m.value
                            ? m.color + " ring-2 ring-offset-1 ring-current"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {paymentMethod !== "debt" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Amount Sent <span className="text-slate-400 font-normal">(optional — to calculate change)</span>
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number" min="0" placeholder="0"
                          className={inputCls}
                          value={amountSent}
                          onChange={(e) => setAmountSent(e.target.value)}
                        />
                        {changeAmount > 0 && (
                          <div className="shrink-0 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm whitespace-nowrap">
                            Change: <span className="font-bold text-green-700">{changeAmount.toLocaleString()} {currency}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {paymentMethod === "debt" && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Debtor Name <span className="text-red-400">*</span>
                        </label>
                        <input
                          className={inputCls} placeholder="Full name of debtor"
                          value={debtorName} onChange={(e) => setDebtorName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Phone (optional)</label>
                        <input
                          className={inputCls} placeholder="+250 7XX XXX XXX"
                          value={debtorPhone} onChange={(e) => setDebtorPhone(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                        &#9888; This sale will be recorded as credit. The debtor will appear in the Debts Tracker below.
                      </div>
                    </div>
                  )}
                </div>

                {/* Line items */}
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Items</span>
                    <button onClick={addLine}
                      className="flex items-center gap-1 text-xs font-semibold text-[#1372e6] bg-[#EBF2FD] hover:bg-[#D5E8FB] px-2.5 py-1 rounded-lg transition">
                      <Plus size={12} /> Add Item
                    </button>
                  </div>

                  <div className="grid grid-cols-[2fr_80px_100px_90px_32px] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold uppercase text-slate-400 tracking-wide">
                    <span>Product</span><span className="text-center">Qty</span><span className="text-center">Unit Price</span><span className="text-right">Subtotal</span><span />
                  </div>

                  <div className="divide-y divide-slate-100">
                    {lineItems.map((line) => {
                      const p = productMap[line.product_id];
                      const subtotal = line.quantity * line.unit_price;
                      const profit = p ? (line.unit_price - p.cost_price) * line.quantity : 0;
                      return (
                        <div key={line.id} className="px-3 py-2">
                          <div className="grid grid-cols-[2fr_80px_100px_90px_32px] gap-2 items-center">
                            <select
                              className="border border-slate-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition"
                              value={line.product_id}
                              onChange={(e) => setLineProduct(line.id, e.target.value)}
                            >
                              <option value="">Select product…</option>
                              {products.map((prod) => (
                                <option key={prod.id} value={prod.id} disabled={prod.quantity === 0}>
                                  {prod.name} ({prod.quantity} left)
                                </option>
                              ))}
                            </select>
                            <input type="number" min="1" max={p?.quantity} value={line.quantity}
                              onChange={(e) => setLineQty(line.id, Number(e.target.value))}
                              className="border border-slate-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition w-full" />
                            <input type="number" min="0" value={line.unit_price}
                              onChange={(e) => setLinePrice(line.id, Number(e.target.value))}
                              className="border border-slate-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#1372e6]/30 focus:border-[#1372e6] transition w-full" />
                            <div className="text-right">
                              <p className="font-semibold text-slate-800 text-sm tabular-nums">{subtotal.toLocaleString()}</p>
                              {p && <p className={`text-[10px] tabular-nums ${profit >= 0 ? "text-green-500" : "text-red-400"}`}>
                                {profit >= 0 ? "+" : ""}{profit.toLocaleString()}
                              </p>}
                            </div>
                            <button onClick={() => removeLine(line.id)} disabled={lineItems.length === 1}
                              className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition disabled:opacity-20">
                              <X size={14} />
                            </button>
                          </div>
                          {p && (
                            <div className="flex gap-3 mt-1.5 text-[10px] text-slate-400">
                              <span>Cost: <span className="font-medium">{p.cost_price.toLocaleString()}</span></span>
                              <span>Sell: <span className="font-medium text-green-600">{p.selling_price.toLocaleString()}</span></span>
                              <span className={p.quantity <= 10 ? "text-amber-500 font-medium" : ""}>Stock: {p.quantity}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex justify-end gap-6">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Grand Total</p>
                      <p className="font-bold text-lg text-slate-800 tabular-nums">{createGrandTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">{currency}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Est. Profit</p>
                      <p className={`font-bold text-lg tabular-nums ${createGrandProfit >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {createGrandProfit >= 0 ? "+" : ""}{createGrandProfit.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center gap-2.5 px-6 py-4 border-t border-slate-100 shrink-0">
                <span className="text-xs text-slate-400">
                  {lineItems.filter((l) => l.product_id).length} of {lineItems.length} item{lineItems.length !== 1 ? "s" : ""} selected
                </span>
                <div className="flex gap-2.5">
                  <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
                  <button onClick={submitForm} disabled={submitting}
                    className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90" style={{ background: "#1372e6" }}>
                    {submitting ? t("common.saving") : `Record Sale${lineItems.filter((l) => l.product_id).length > 1 ? ` (${lineItems.filter((l) => l.product_id).length} items)` : ""}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EDIT MODAL */}
        {showModal && modalMode === "edit" && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0">
                <h2 className="text-base font-semibold text-slate-800">{t("sales.edit_title")}</h2>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 grid md:grid-cols-2 gap-4 overflow-y-auto flex-1">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.product")} <span className="text-red-400">*</span></label>
                  <select className={inputCls} value={form.product_id} onChange={(e) => onProductChange(e.target.value)}>
                    <option value="">{t("common.search")}...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.quantity === 0}>
                        {p.name} — {t("items.col_qty")}: {p.quantity}
                      </option>
                    ))}
                  </select>
                  {selectedProduct && (
                    <div className="mt-1.5 flex gap-3 text-xs text-slate-500">
                      <span>{t("items.cost_price")}: <span className="font-medium text-slate-700">{selectedProduct.cost_price.toLocaleString()}</span></span>
                      <span>{t("items.selling_price")}: <span className="font-medium text-green-600">{selectedProduct.selling_price.toLocaleString()}</span></span>
                      <span className={`font-medium ${selectedProduct.quantity <= 10 ? "text-amber-600" : "text-slate-700"}`}>{t("items.col_qty")}: {selectedProduct.quantity}</span>
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.customer")}</label>
                  <select className={inputCls} value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                    <option value="">—</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.quantity")} <span className="text-red-400">*</span></label>
                  <input type="number" min="1" max={selectedProduct?.quantity} className={inputCls} placeholder="0"
                    value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.unit_price")} <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0"
                    value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                </div>
                {form.product_id && form.quantity && form.unit_price && (
                  <div className="md:col-span-2 bg-slate-50 rounded-lg px-3 py-2 flex gap-6 text-sm">
                    <div><p className="text-xs text-gray-400">{t("common.total")}</p><p className="font-bold text-slate-800">{(Number(form.quantity) * Number(form.unit_price)).toLocaleString()}</p></div>
                    {selectedProduct && (
                      <div><p className="text-xs text-gray-400">{t("sales.col_profit")}</p>
                        <p className={`font-bold ${(Number(form.unit_price) - selectedProduct.cost_price) * Number(form.quantity) >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {((Number(form.unit_price) - selectedProduct.cost_price) * Number(form.quantity)).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("common.notes")}</label>
                  <input className={inputCls} placeholder="..."
                    value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2.5 px-4 sm:px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
                <button onClick={submitForm} disabled={submitting}
                  className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90" style={{ background: "#1372e6" }}>
                  {submitting ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DEBT ADD/EDIT MODAL */}
        {showDebtModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">{editingDebt ? "Edit Debt" : "Add Debt"}</h2>
                <button onClick={() => { setShowDebtModal(false); setEditingDebt(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={16} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Debtor Name <span className="text-red-400">*</span></label>
                  <input className={inputCls} placeholder="Full name"
                    value={debtForm.debtor_name} onChange={(e) => setDebtForm({ ...debtForm, debtor_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input className={inputCls} placeholder="+250 7XX XXX XXX"
                    value={debtForm.phone} onChange={(e) => setDebtForm({ ...debtForm, phone: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount Owed <span className="text-red-400">*</span></label>
                    <input type="number" min="0" className={inputCls} placeholder="0"
                      value={debtForm.amount_owed} onChange={(e) => setDebtForm({ ...debtForm, amount_owed: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount Paid So Far</label>
                    <input type="number" min="0" className={inputCls} placeholder="0"
                      value={debtForm.amount_paid} onChange={(e) => setDebtForm({ ...debtForm, amount_paid: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <input className={inputCls} placeholder="Optional"
                    value={debtForm.notes} onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-slate-100">
                <button onClick={() => { setShowDebtModal(false); setEditingDebt(null); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">Cancel</button>
                <button onClick={submitDebt} disabled={debtSubmitting}
                  className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90" style={{ background: "#1372e6" }}>
                  {debtSubmitting ? "Saving…" : (editingDebt ? "Save Changes" : "Add Debt")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RECORD PAYMENT MODAL */}
        {showPayModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">Record Payment</h2>
                <button onClick={() => setShowPayModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={16} /></button>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-slate-500 mb-3">
                  <span className="font-semibold text-slate-700">{showPayModal.debtor_name}</span> owes{" "}
                  <span className="font-bold text-orange-600">{showPayModal.balance.toLocaleString()} {currency}</span>
                </p>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount Being Paid Now <span className="text-red-400">*</span></label>
                <input
                  type="number" min="0" max={showPayModal.balance}
                  className={inputCls} placeholder="0" autoFocus
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
                {paymentAmount && Number(paymentAmount) >= showPayModal.balance && (
                  <p className="mt-2 text-xs text-green-600 font-medium">This will fully settle the debt.</p>
                )}
              </div>
              <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-slate-100">
                <button onClick={() => setShowPayModal(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">Cancel</button>
                <button onClick={recordPayment} disabled={!paymentAmount || payingDebtId === showPayModal.id}
                  className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90" style={{ background: "#1372e6" }}>
                  {payingDebtId === showPayModal.id ? "Saving…" : "Confirm Payment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RECEIPT PREVIEW MODAL */}
        {receipts.length > 0 && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
              <div className="flex justify-between items-center px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-700">
                  <ReceiptText size={15} />
                  <span className="font-semibold text-sm">Sale Complete — Receipt Preview</span>
                </div>
                <button onClick={() => setReceipts([])} className="text-slate-400 hover:text-slate-600 transition"><X size={16} /></button>
              </div>

              <div className="px-6 py-5 font-mono text-sm bg-white max-h-96 overflow-y-auto">
                <div className="text-center mb-4">
                  <p className="font-bold text-base text-slate-900 uppercase tracking-widest">{shopName || "HIGOVERSE SHOP"}</p>
                  <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-wider">Sales Receipt</p>
                </div>
                <div className="border-t border-dashed border-slate-300 my-3" />
                <div className="space-y-1.5 text-xs text-slate-600 mb-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Receipt #</span>
                    <span className="font-semibold">{receipts[0]?.id?.slice(0, 8)?.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Date</span>
                    <span>{receipts[0]?.created_at ? new Date(receipts[0].created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                  {receipts[0]?.customer_id && customerMap[receipts[0].customer_id] && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Customer</span>
                      <span className="font-medium">{customerMap[receipts[0].customer_id].name}</span>
                    </div>
                  )}
                  {receipts[0]?.payment_method && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Payment</span>
                      <span className="font-semibold uppercase">{receipts[0].payment_method}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-dashed border-slate-300 my-3" />
                <div className="space-y-2 mb-3">
                  {receipts.map((s) => (
                    <div key={s.id}>
                      <p className="font-bold text-slate-800 text-xs">{s.product_name || "Item"}</p>
                      <div className="flex justify-between text-xs text-slate-600 mt-0.5">
                        <span>{s.quantity} × {s.unit_price.toLocaleString()} {currency}</span>
                        <span className="font-semibold">{s.total_amount.toLocaleString()} {currency}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-300 my-3" />
                <div className="flex justify-between font-bold text-base text-slate-900">
                  <span>TOTAL</span>
                  <span>{receipts.reduce((s, x) => s + x.total_amount, 0).toLocaleString()} {currency}</span>
                </div>
                {receipts[0]?.amount_paid != null && receipts[0].amount_paid > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-slate-600 mt-1.5">
                      <span>Amount Paid</span>
                      <span>{receipts[0].amount_paid.toLocaleString()} {currency}</span>
                    </div>
                    {receipts[0].amount_paid > receipts.reduce((s, x) => s + x.total_amount, 0) && (
                      <div className="flex justify-between text-xs text-green-600 font-semibold mt-0.5">
                        <span>Change</span>
                        <span>{(receipts[0].amount_paid - receipts.reduce((s, x) => s + x.total_amount, 0)).toLocaleString()} {currency}</span>
                      </div>
                    )}
                  </>
                )}
                {receipts[0]?.payment_method === "debt" && (
                  <div className="mt-2 text-xs text-orange-600 font-semibold text-center border border-orange-200 rounded-lg py-1">&#9888; ON CREDIT — Amount owed</div>
                )}
                <div className="border-t border-dashed border-slate-300 my-3" />
                <p className="text-center text-xs text-slate-400">Thank you for your business!</p>
              </div>

              <div className="flex gap-2 px-3 py-2 border-t border-slate-100 bg-slate-50">
                <button onClick={() => { setReceipts([]); openCreateModal(); }}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-100 transition">
                  New Sale
                </button>
                <button onClick={() => setReceipts([])}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-100 transition">
                  Close
                </button>
                <button onClick={() => printReceiptPopup(receipts)}
                  className="flex-1 px-3 py-2 rounded-lg text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 hover:opacity-90" style={{ background: "#1372e6" }}>
                  <Printer size={13} /> Print
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
