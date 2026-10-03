"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { saleRequest } from "@/lib/sale-api";
import { settingsRequest } from "@/lib/settings-api";
import { listProformas, deleteProforma, type Proforma, type ProformaStatus } from "@/lib/proforma-api";
import { useAutoRefresh, useDebounce } from "@/lib/hooks";
import { useLanguage } from "@/lib/language-context";
import { useShopSettings } from "@/lib/shop-settings-context";
import { useShop } from "@/lib/shop-context";
import { formatPublicAddress } from "@/lib/product-meta";
import Pagination from "@/app/components/ui/Pagination";
import ProductPicker, { type PickerProduct } from "@/app/components/ui/ProductPicker";
import { parseAttributes } from "@/lib/business-layout";
import { useCanSeeFinancials, useShowsProfit } from "@/lib/permissions";
import DeepLink from "@/app/components/DeepLink";
import DateRangeFilter from "@/app/components/ui/DateRangeFilter";
import {
  ShoppingBag, Filter, Plus, Trash2, Pencil, X, ReceiptText, Calendar, Printer, Wallet, AlertCircle, CheckCircle2, Phone, ChevronDown, Download, Upload, FileSpreadsheet, FileText, RefreshCw, Search,
} from "lucide-react";
import { askConfirm, notify } from "@/lib/dialogs";

const PROFORMA_STATUS_META: Record<ProformaStatus, { labelKey: string; color: string }> = {
  draft:    { labelKey: "sales.status_draft",    color: "bg-slate-100 text-slate-600 border-slate-200" },
  sent:     { labelKey: "sales.status_sent",     color: "bg-blue-50 text-blue-600 border-blue-200" },
  accepted: { labelKey: "sales.status_accepted", color: "bg-green-50 text-green-700 border-green-200" },
  expired:  { labelKey: "sales.status_expired",  color: "bg-red-50 text-red-600 border-red-200" },
};

interface Sale {
  id: string; product_id: string; product_name?: string;
  customer_id?: string; quantity: number; unit_price: number;
  total_amount: number; profit?: number; notes?: string;
  payment_method?: string; amount_paid?: number;
  created_at?: string;
}
interface Product { id: string; name: string; selling_price: number; cost_price: number; quantity: number; }
interface Partner { id: string; name: string; phone?: string; address?: string; id_number?: string | null; }
type Buyer = { name: string; phone: string; id_number: string; address: string };
const EMPTY_BUYER: Buyer = { name: "", phone: "", id_number: "", address: "" };
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
const PAYMENT_METHODS: { value: PaymentMethod; labelKey: string; color: string }[] = [
  { value: "cash",   labelKey: "sales.pm_cash",   color: "bg-green-100 text-green-700 border-green-200" },
  { value: "mtn",    labelKey: "sales.pm_mtn",    color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "airtel", labelKey: "sales.pm_airtel", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "bank",   labelKey: "sales.pm_bank",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "card",   labelKey: "sales.pm_card",   color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "debt",   labelKey: "sales.pm_debt",   color: "bg-orange-100 text-orange-700 border-orange-200" },
];

function paymentBadge(method: string | undefined, t: (key: string) => string) {
  const m = PAYMENT_METHODS.find((p) => p.value === method) || PAYMENT_METHODS[0];
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${m.color}`}>{t(m.labelKey)}</span>;
}

function genId() { return Math.random().toString(36).slice(2, 9); }
function emptyLine(): LineItem { return { id: genId(), product_id: "", quantity: 1, unit_price: 0 }; }
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SaleManagementPage() {
  // Car companies keep profit, costs and revenue totals from their staff.
  const fin = useCanSeeFinancials();
  // Car companies never show profit, loss or margins (owners included).
  const prof = useShowsProfit();
  const { t, lang, layout } = useLanguage();
  // Car companies sell every vehicle to a named customer.
  const isCar = layout === "car";
  const { lowStock } = useShopSettings();
  const { shop } = useShop();

  const [sales, setSales] = useState<Sale[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  // Lists open on the last 7 days (the date picker's "7 days" preset).
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return toDateStr(d); });
  const [dateTo, setDateTo] = useState(() => toDateStr(new Date()));
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modalMode, setModalMode] = useState<ModalMode>("create");
  // The dashboard's "Record sale" button links here with ?new=1.
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
  // Car sales: the buyer's details (picked customer, or a new one to save).
  const [buyer, setBuyer] = useState<Buyer>(EMPTY_BUYER);
  const [buyerTried, setBuyerTried] = useState(false);
  // New sale opens with the product search already open — just start typing.
  const [autoPick, setAutoPick] = useState(true);
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

  // Proforma state
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [proformasLoading, setProformasLoading] = useState(false);
  const [deletingProformaId, setDeletingProformaId] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Keep figures current without polling hidden tabs.
  useAutoRefresh(() => loadData(true));

  const debouncedSearch = useDebounce(search, 350);

  useEffect(() => {
    loadData(); loadDebts(); loadProformas();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

  async function loadProformas() {
    try {
      setProformasLoading(true);
      const res = await listProformas({ limit: 10 });
      setProformas(res.items || []);
    } catch { /* non-fatal */ }
    finally { setProformasLoading(false); }
  }

  async function handleDeleteProforma(id: string) {
    if (!(await askConfirm({ message: t("sales.confirm_delete_proforma"), danger: true }))) return;
    try {
      setDeletingProformaId(id);
      await deleteProforma(id);
      await loadProformas();
    } catch { notify(t("common.delete_failed")); }
    finally { setDeletingProformaId(""); }
  }

  function openCreateModal(autoSearch = true) {
    setAutoPick(autoSearch);
    setLineItems([emptyLine()]); setSaleCustomer(""); setSaleNotes("");
    setPaymentMethod("cash"); setAmountSent(""); setDebtorName(""); setDebtorPhone("");
    setBuyer(EMPTY_BUYER); setBuyerTried(false);
    setEditingId(null); setModalMode("create"); setShowModal(true);
  }
  // Dashboard "Record sale" and vehicle-card "Sell" links: /sales?new=1[&product=<id>]
  function handleDeepLink(params: URLSearchParams) {
    if (params.get("new") !== "1") return;
    const id = params.get("product");
    openCreateModal(!id);
    if (!id) return;
    itemRequest(`/products/${id}`)
      .then((res) => {
        const prod = res?.data as PickerProduct | undefined;
        if (!prod) return;
        rememberProduct(prod);
        setLineItems((prev) => {
          const next = prev.map((l, i) => (i === 0 ? { ...l, product_id: prod.id, unit_price: prod.selling_price } : l));
          return next.every((l) => l.product_id) ? [...next, emptyLine()] : next;
        });
        const a = parseAttributes(prod.attributes);
        if (a.buyer_name || a.buyer_phone) {
          const digits = (x?: string | null) => (x || "").replace(/\D/g, "");
          const match = a.buyer_phone ? customers.find((c) => digits(c.phone) && digits(c.phone) === digits(a.buyer_phone)) : undefined;
          if (match) {
            setSaleCustomer(match.id);
            setBuyer({ name: match.name || a.buyer_name || "", phone: match.phone || a.buyer_phone || "", id_number: match.id_number || a.buyer_id_no || "", address: match.address || "" });
          } else {
            setSaleCustomer("");
            setBuyer({ name: a.buyer_name || "", phone: a.buyer_phone || "", id_number: a.buyer_id_no || "", address: "" });
          }
        }
      })
      .catch(() => {});
  }
  function openEditModal(s: Sale) {
    setForm({ product_id: s.product_id, customer_id: s.customer_id || "", quantity: String(s.quantity), unit_price: String(s.unit_price), notes: s.notes || "" });
    setEditingId(s.id); setModalMode("edit"); setShowModal(true);
    if (s.product_id && !products.some((p) => p.id === s.product_id)) {
      itemRequest(`/products/${s.product_id}`)
        .then((res) => { if (res?.data) rememberProduct(res.data); })
        .catch(() => {});
    }
  }
  function closeModal() {
    setShowModal(false); setForm(EMPTY_FORM); setEditingId(null);
    setLineItems([emptyLine()]); setSaleCustomer(""); setSaleNotes("");
    setPaymentMethod("cash"); setAmountSent(""); setDebtorName(""); setDebtorPhone("");
    setBuyer(EMPTY_BUYER); setBuyerTried(false);
  }

  function addLine() { setLineItems((prev) => [...prev, emptyLine()]); }
  function removeLine(id: string) { setLineItems((prev) => prev.filter((l) => l.id !== id)); }
  // The picker searches the whole catalogue; keep anything picked in the local
  // list so name/price/stock lookups below find it.
  function rememberProduct(p: PickerProduct) {
    setProducts((prev) => prev.some((x) => x.id === p.id) ? prev.map((x) => x.id === p.id ? p : x) : [...prev, p]);
  }
  // Picking a product fills the line and opens a fresh empty line below, so
  // items go in one after another without pressing "Add". Picking a product
  // that's already on the sale adds one to that line instead of a duplicate.
  function setLineProduct(id: string, p: PickerProduct) {
    rememberProduct(p);
    setLineItems((prev) => {
      const dup = prev.find((l) => l.product_id === p.id && l.id !== id);
      let next = dup
        ? prev.map((l) => l.id === dup.id ? { ...l, quantity: Math.min(l.quantity + 1, Math.max(1, p.quantity)) } : l)
        : prev.map((l) => l.id === id ? { ...l, product_id: p.id, unit_price: p.selling_price } : l);
      if (next.every((l) => l.product_id)) next = [...next, emptyLine()];
      return next;
    });
  }
  function setLineQty(id: string, qty: number, stock?: number) {
    const max = stock && stock > 0 ? stock : Infinity;
    setLineItems((prev) => prev.map((l) => l.id === id ? { ...l, quantity: Math.min(max, Math.max(1, qty || 1)) } : l));
  }
  function setSaleCustomerAndDebtor(id: string) {
    setSaleCustomer(id);
    const c = customers.find((x) => x.id === id);
    if (c) { setDebtorName(c.name); setDebtorPhone(c.phone || ""); }
    setBuyer(c ? { name: c.name || "", phone: c.phone || "", id_number: c.id_number || "", address: c.address || "" } : EMPTY_BUYER);
  }
  function setLinePrice(id: string, price: number) {
    setLineItems((prev) => prev.map((l) => l.id === id ? { ...l, unit_price: Math.max(0, price) } : l));
  }

  function onProductChange(product: PickerProduct) {
    rememberProduct(product);
    setForm((f) => ({ ...f, product_id: product.id, unit_price: String(product.selling_price) }));
  }

  async function submitForm() {
    if (modalMode === "edit" && editingId) {
      if (!form.product_id || !form.quantity || !form.unit_price) {
        notify(t("sales.sale_fields_required")); return;
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
      } catch (err: unknown) { notify(err instanceof Error ? err.message : t("common.error")); }
      finally { setSubmitting(false); }
      return;
    }

    const validLines = lineItems.filter((l) => l.product_id && l.quantity > 0 && l.unit_price >= 0);
    if (validLines.length === 0) { notify(t("sales.need_one_item")); return; }
    if (isCar) {
      setBuyerTried(true);
      if (![buyer.name, buyer.phone, buyer.id_number, buyer.address].every((x) => x.trim())) { notify(t("sales.buyer_required")); return; }
      if (buyer.phone.replace(/\D/g, "").length < 9) { notify(t("vehicle.phone_invalid")); return; }
    }
    const debtor = debtorName.trim() || (isCar ? buyer.name.trim() : "");
    if (paymentMethod === "debt" && !debtor) { notify(t("sales.need_debtor_name")); return; }

    const grandTotal = validLines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

    try {
      setSubmitting(true);
      const created: Sale[] = [];
      const errors: string[] = [];

      let customerId = saleCustomer;
      if (isCar) {
        const details = { name: buyer.name.trim(), phone: buyer.phone.trim(), id_number: buyer.id_number.trim(), address: buyer.address.trim() };
        try {
          const digits = (x?: string | null) => (x || "").replace(/\D/g, "");
          if (!customerId) customerId = customers.find((c) => digits(c.phone) && digits(c.phone) === digits(details.phone))?.id ?? "";
          if (!customerId) {
            const res = await partnerRequest("/suppliers", { method: "POST", body: JSON.stringify(details) });
            customerId = res?.data?.id ?? "";
          } else {
            const c = customers.find((x) => x.id === customerId);
            const changed = !c || c.name !== details.name || (c.phone || "") !== details.phone
              || (c.id_number || "") !== details.id_number || (c.address || "") !== details.address;
            if (changed) await partnerRequest(`/suppliers/${customerId}`, { method: "PUT", body: JSON.stringify(details) });
          }
        } catch { customerId = ""; }
        if (!customerId) { notify(t("sales.buyer_save_failed")); return; }
      }

      for (const line of validLines) {
        try {
          const res = await saleRequest("/sales", {
            method: "POST",
            body: JSON.stringify({
              product_id: line.product_id,
              customer_id: customerId || undefined,
              quantity: line.quantity,
              unit_price: line.unit_price,
              notes: saleNotes.trim() || undefined,
              payment_method: paymentMethod,
              amount_paid: amountSent ? Number(amountSent) : (paymentMethod === "debt" ? 0 : undefined),
            }),
          });
          if (res?.data?.id) created.push(res.data);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : t("common.unknown_error"));
        }
      }

      if (paymentMethod === "debt" && created.length > 0) {
        try {
          await saleRequest("/debts", {
            method: "POST",
            body: JSON.stringify({
              debtor_name: debtor,
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
      if (errors.length > 0) notify(`${t("sales.some_items_failed")}\n${errors.join("\n")}`);
      await loadData(true);
    } finally { setSubmitting(false); }
  }

  async function deleteSale(id: string) {
    if (!(await askConfirm({ message: t("common.confirm_delete"), danger: true }))) return;
    try {
      setDeletingId(id);
      await saleRequest(`/sales/${id}`, { method: "DELETE" });
      await loadData(true);
    } catch { notify(t("common.delete_failed")); }
    finally { setDeletingId(""); }
  }

  async function submitDebt() {
    if (!debtForm.debtor_name.trim() || !debtForm.amount_owed) { notify(t("sales.debt_fields_required")); return; }
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
    } catch (err: unknown) { notify(err instanceof Error ? err.message : t("common.error")); }
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
    } catch (err: unknown) { notify(err instanceof Error ? err.message : t("common.error")); }
    finally { setPayingDebtId(""); }
  }

  async function deleteDebt(id: string) {
    if (!(await askConfirm({ message: t("sales.confirm_delete_debt"), danger: true }))) return;
    try {
      setDeletingDebtId(id);
      await saleRequest(`/debts/${id}`, { method: "DELETE" });
      await loadDebts();
    } catch { notify(t("common.delete_failed")); }
    finally { setDeletingDebtId(""); }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["product_name", "quantity", "unit_price", "payment_method", "notes"],
      ["Sugar 1kg", "5", "1000", "cash", ""],
      ["Rice 5kg", "2", "4500", "mtn", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, "sales_template.xlsx");
  }

  async function handleImportSales(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws);
      let imported = 0, failed = 0;
      for (const row of rows) {
        try {
          const productName = (row.product_name || row["Product Name"] || "").trim();
          const product = products.find((p) => p.name.toLowerCase() === productName.toLowerCase());
          if (!product) { failed++; continue; }
          await saleRequest("/sales", {
            method: "POST",
            body: JSON.stringify({
              product_id: product.id,
              quantity: Number(row.quantity || row.Quantity || 1),
              unit_price: Number(row.unit_price || row["Unit Price"] || product.selling_price),
              payment_method: (row.payment_method || row["Payment Method"] || "cash").toLowerCase(),
              notes: (row.notes || row.Notes || "").trim() || undefined,
            }),
          });
          imported++;
        } catch { failed++; }
      }
      e.target.value = "";
      notify(`${imported} ${t("sales.import_success")}${failed ? `, ${failed} ${t("sales.import_partial_fail")}` : ""}`, failed ? "warning" : "success");
      await loadData(true);
    } catch { notify(t("common.parse_failed")); }
  }

  async function exportSalesExcel() {
    const XLSX = await import("xlsx");
    const data = filtered.map((s) => ({
      Date: s.created_at ? new Date(s.created_at).toLocaleDateString() : "",
      Product: s.product_name || productMap[s.product_id]?.name || "",
      Customer: customerMap[s.customer_id || ""]?.name || "",
      Payment: s.payment_method || "cash",
      Qty: s.quantity,
      "Unit Price": s.unit_price,
      Total: s.total_amount,
      ...(prof ? { Profit: s.profit || 0 } : {}),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, "sales.xlsx");
  }

  async function exportSalesPDF() {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Sales Report", 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Date", "Product", "Customer", "Payment", "Qty", "Unit Price", "Total", ...(prof ? ["Profit"] : [])]],
      body: filtered.map((s) => [
        s.created_at ? new Date(s.created_at).toLocaleDateString() : "-",
        s.product_name || productMap[s.product_id]?.name || "-",
        customerMap[s.customer_id || ""]?.name || "-",
        s.payment_method || "cash",
        String(s.quantity),
        s.unit_price.toLocaleString(),
        s.total_amount.toLocaleString(),
        ...(prof ? [(s.profit || 0).toLocaleString()] : []),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [19, 114, 230] },
    });
    doc.save("sales.pdf");
  }

  function printReceiptPopup(salesToPrint: Sale[]) {
    const grandTotal = salesToPrint.reduce((s, x) => s + x.total_amount, 0);
    const receiptNo = salesToPrint[0]?.id?.slice(0, 8)?.toUpperCase() || t("sales.receipt_fallback_no");
    const dateStr = salesToPrint[0]?.created_at
      ? new Date(salesToPrint[0].created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
      : new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    const customerName = salesToPrint[0]?.customer_id ? customerMap[salesToPrint[0].customer_id]?.name : "";
    const pm = salesToPrint[0]?.payment_method;
    const paid = salesToPrint[0]?.amount_paid;
    const change = paid && paid > grandTotal ? paid - grandTotal : 0;

    const itemsHtml = salesToPrint.map((s) =>
      `<tr>
        <td style="padding:6px 4px 6px 0;border-bottom:1px dotted #ddd;word-break:break-word;">${s.product_name || t("sales.receipt_item")}</td>
        <td style="padding:6px 4px;border-bottom:1px dotted #ddd;text-align:center;white-space:nowrap;">${s.quantity}</td>
        <td style="padding:6px 4px;border-bottom:1px dotted #ddd;text-align:right;white-space:nowrap;">${s.unit_price.toLocaleString()}</td>
        <td style="padding:6px 0 6px 4px;border-bottom:1px dotted #ddd;text-align:right;font-weight:600;white-space:nowrap;">${s.total_amount.toLocaleString()}</td>
      </tr>`
    ).join("");

    const paymentHtml = pm ? `
      <hr class="dashed">
      <div class="row"><span class="label">${t("sales.payment")}</span><span style="font-weight:700;text-transform:uppercase">${pm}</span></div>
      ${paid ? `<div class="row"><span class="label">${t("sales.amount_paid")}</span><span>${paid.toLocaleString()} ${currency}</span></div>` : ""}
      ${change > 0 ? `<div class="row" style="color:#16a34a"><span class="label">${t("sales.change_label")}</span><span style="font-weight:700">${change.toLocaleString()} ${currency}</span></div>` : ""}
      ${pm === "debt" ? `<div class="row" style="color:#dc2626"><span class="label">&#9888; ${t("sales.on_credit")}</span><span style="font-weight:700">${grandTotal.toLocaleString()} ${currency} ${t("sales.owed")}</span></div>` : ""}
    ` : "";

    const html = `<!DOCTYPE html>
<html lang="${lang}">
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
  <div class="shop-name">${shop?.name || shopName}</div>
  ${formatPublicAddress(shop?.address) ? `<div style="color:#666;font-size:10px;margin-top:2px">${formatPublicAddress(shop?.address)}</div>` : ""}
  ${shop?.phone ? `<div style="color:#666;font-size:10px;margin-top:1px">${shop.phone}</div>` : ""}
  <div style="color:#666;font-size:10px;margin-top:2px;text-transform:uppercase;letter-spacing:1px">${t("sales.receipt_title")}</div>
</div>
<hr class="dashed">
<div class="row"><span class="label">${t("sales.receipt_no")}</span><span style="font-weight:700">${receiptNo}</span></div>
<div class="row"><span class="label">${t("common.date")}</span><span>${dateStr}</span></div>
${customerName ? `<div class="row"><span class="label">${t("sales.col_customer")}</span><span style="font-weight:600">${customerName}</span></div>` : ""}
<hr class="dashed">
<table>
  <thead><tr>
    <th style="text-align:left">${t("sales.receipt_item")}</th>
    <th style="text-align:center">${t("sales.col_qty")}</th>
    <th>${t("sales.unit_price")}</th>
    <th>${t("common.total")}</th>
  </tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<hr class="solid">
<div class="row total-line">
  <span>${t("sales.receipt_grand_total")}</span>
  <span>${grandTotal.toLocaleString()} ${currency}</span>
</div>
${paymentHtml}
<hr class="dashed">
<div class="footer-text" style="margin-top:12px">${t("sales.thank_you")}</div>
<div class="footer-text">${t("sales.powered_by")} Higoverse</div>
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
    return s + (p && p.cost_price != null ? (l.unit_price - p.cost_price) * l.quantity : 0);
  }, 0);
  const changeAmount = amountSent && Number(amountSent) > createGrandTotal ? Number(amountSent) - createGrandTotal : 0;

  const totalPages = Math.ceil(salesTotal / pageSize);
  const selectedProduct = products.find((p) => p.id === form.product_id);
  const hasDateFilter = dateFrom || dateTo;

  const inputCls = "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition";

  const pendingDebts = debts.filter((d) => !d.is_paid);

  if (loading) return <SalesSkeleton />;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        <DeepLink keys={["new", "product"]} onParams={handleDeepLink} />

        {/* HEADER */}
        <div className="hgv-surface relative rounded-2xl mb-2 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0a66c2 0%, #004182 50%, #00376b 100%)" }}>
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
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest leading-none">{t("nav.sales")}</p>
                <h1 className="text-base font-extrabold text-white leading-tight tracking-tight">{t("sales.title")}</h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => loadData(true)} disabled={refreshing}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all disabled:opacity-40">
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button onClick={() => openCreateModal()}
                className="flex items-center gap-1.5 bg-white text-[#0a66c2] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 active:scale-95 transition-all shadow-lg shadow-black/20">
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
            <p className="text-[10px] text-blue-100/70 flex-1">
              {t("sales.live_label")} · <span className="font-semibold text-white/80">{salesTotal.toLocaleString()} {t("sales.sales_word")}</span>
              {lastUpdated && <span className="ml-1 text-blue-200/50">· {t("common.updated")} {lastUpdated.toLocaleTimeString()}</span>}
            </p>
          </div>

          {/* Row 3: search + filter + date range */}
          <div className="relative px-4 pb-3 space-y-2">
            <div className="flex gap-2">
              <div className="hgv-search">
                <Search size={16} className="hgv-search-icon" />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder={t("items.search")}
                  className="hgv-search-input" />
                {search && (
                  <button onClick={() => setSearch("")} className="hgv-search-clear">
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="hgv-filter">
                <Filter size={14} className="shrink-0" />
                <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}
                  >
                  <option value="all" className="text-gray-800">{t("sales.all")}</option>
                  {prof && <option value="profit" className="text-gray-800">{t("sales.profit")}</option>}
                  {prof && <option value="loss" className="text-gray-800">{t("sales.loss")}</option>}
                  <optgroup label={t("sales.by_payment")} className="text-gray-600">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={`pay:${m.value}`} className="text-gray-800">{t(m.labelKey)} {t("sales.only_suffix")}</option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown size={14} className="shrink-0" />
              </div>
            </div>
            <DateRangeFilter
              from={dateFrom} to={dateTo}
              onFrom={(v) => { setDateFrom(v); setPage(1); }}
              onTo={(v) => { setDateTo(v); setPage(1); }}
              onClear={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
              accentClass="focus:ring-[#0a66c2]/30 focus:border-[#0a66c2]"
            />
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 mb-2">
          {[
            { label: t("sales.count"),        value: stats.total,                                                            color: "text-[#0a66c2]",  dot: "bg-[#0a66c2]"  },
            ...(!fin ? [] : [{ label: t("sales.revenue"),       value: stats.revenue.toLocaleString(),                                         color: "text-green-600",  dot: "bg-green-500"  },
            ...(prof ? [{ label: t("sales.profit"),        value: `${stats.profit >= 0 ? "+" : ""}${stats.profit.toLocaleString()}`,      color: stats.profit >= 0 ? "text-green-700" : "text-red-500", dot: stats.profit >= 0 ? "bg-green-500" : "bg-red-500" }] : [])]),
            { label: t("reports.customers"),   value: stats.uniqueCustomers,                                                  color: "text-[#0a66c2]",  dot: "bg-blue-400"   },
            { label: t("sales.outstanding"),   value: debtsTotalOutstanding.toLocaleString(),                                  color: "text-orange-500", dot: "bg-orange-400" },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${card.dot}`} />
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none truncate">{card.label}</p>
              </div>
              <p className={`text-xl font-bold leading-none tabular-nums ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* PAYMENT BREAKDOWN */}
        {fin && sales.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 px-3 py-1.5 mb-2 flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">{t("sales.payments_label")}</span>
            {PAYMENT_METHODS.filter((m) => (stats.payBreakdown[m.value]?.count ?? 0) > 0).map((m) => {
              const b = stats.payBreakdown[m.value];
              return (
                <div key={m.value} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] ${m.color}`}>
                  <span className="font-semibold">{t(m.labelKey)}</span>
                  <span className="opacity-60">·</span>
                  <span>{b.count} {b.count === 1 ? t("sales.sale_singular") : t("sales.sale_plural")}</span>
                  <span className="opacity-60">·</span>
                  <span className="font-semibold tabular-nums">{b.revenue.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
            <p className="text-[10px] text-slate-500">
              <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span> {t("common.of")} <span className="font-semibold text-slate-700">{salesTotal.toLocaleString()}</span> {t("sales.sales_word")}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={downloadTemplate} title={t("sales.download_template_tooltip")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                <Download size={10} /> {t("common.template")}
              </button>
              <button onClick={() => fileInputRef.current?.click()} title={t("sales.import_tooltip")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 transition">
                <Upload size={10} /> {t("common.import")}
              </button>
              <button onClick={exportSalesExcel} title={t("sales.export_excel_tooltip")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-green-200 text-green-600 bg-white hover:bg-green-50 transition">
                <FileSpreadsheet size={10} /> Excel
              </button>
              <button onClick={exportSalesPDF} title={t("sales.export_pdf_tooltip")}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-red-200 text-red-600 bg-white hover:bg-red-50 transition">
                <FileText size={10} /> PDF
              </button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportSales} />
          <div className="overflow-x-auto">
          {(debouncedSearch || filter !== "all") && (
            <div className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500 bg-slate-50">
              <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span> {t("common.results")}
              {debouncedSearch && <> {t("common.search_for")} &ldquo;<span className="font-medium">{debouncedSearch}</span>&rdquo;</>}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {[t("sales.col_date"), t("sales.col_product"), t("sales.col_customer"), t("sales.payment"), t("sales.col_qty"), t("sales.col_price"), t("sales.col_total"), ...(prof ? [t("sales.profit_margin_col")] : []), t("common.notes"), ""].map((h) => (
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
                  <tr key={s.id} className={`hover:bg-slate-50/60 transition-colors border-l-2 ${!prof ? "border-l-slate-200" : isProfit ? "border-l-green-400" : (s.profit || 0) < 0 ? "border-l-red-400" : "border-l-slate-200"}`}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {saleDate ? (
                        <div>
                          <p className="text-xs font-medium text-slate-700">{toDateStr(saleDate)}</p>
                          <p className="text-xs text-slate-400">{saleDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      ) : <span className="text-slate-300 text-xs">-</span>}
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const name = s.product_name || product?.name;
                        const costPrice = product?.cost_price;
                        return name
                          ? <div>
                              <p className="font-semibold text-slate-800">{name}</p>
                              {fin && costPrice != null && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  cost {costPrice.toLocaleString()} · sell {s.unit_price.toLocaleString()}
                                </p>
                              )}
                            </div>
                          : <span className="text-slate-400 text-xs">{t("sales.unknown_product")}</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      {customer
                        ? <div><p className="font-medium text-slate-700">{customer.name}</p>{customer.phone && <p className="text-xs text-slate-400">{customer.phone}</p>}</div>
                        : <span className="text-slate-400 text-xs italic">-</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {paymentBadge(s.payment_method, t)}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-700 tabular-nums">{s.quantity}</td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">{s.unit_price.toLocaleString()}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800 tabular-nums">{s.total_amount.toLocaleString()}</td>
                    {prof && <td className={`px-3 py-2 tabular-nums ${isProfit ? "text-green-600" : "text-red-500"}`}>
                      <span className="font-semibold">{isProfit ? "+" : ""}{(s.profit || 0).toLocaleString()}</span>
                      {s.total_amount > 0 && (
                        <span className="block text-[10px] font-normal opacity-60">
                          {Math.round(((s.profit || 0) / s.total_amount) * 100)}% {t("sales.margin_suffix")}
                        </span>
                      )}
                    </td>}
                    <td className="px-3 py-2 text-slate-400 text-xs max-w-28 truncate">{s.notes || <span className="text-slate-200">-</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => printReceiptPopup([s])} title={t("common.print")}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 transition">
                          <Printer size={14} />
                        </button>
                        <button onClick={() => openEditModal(s)}
                          className="p-1.5 rounded-lg bg-[#EBF2FD] hover:bg-[#D5E8FB] text-[#0a66c2] transition">
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
                    <td className="px-4 py-2" colSpan={6}>{t("sales.subtotal_label")} · {filtered.length} {t("sales.sales_word")}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-700">{fRev.toLocaleString()}</td>
                    {prof && <td className={`px-4 py-2 tabular-nums ${fProfit >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {fProfit >= 0 ? "+" : ""}{fProfit.toLocaleString()}
                      <span className="block text-[10px] font-normal opacity-70">{fMargin.toFixed(1)}% {t("sales.margin_suffix")}</span>
                    </td>}
                    <td colSpan={2} />
                  </tr>
                );
              })()}
            </tbody>
          </table>
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="p-4 bg-slate-100 rounded-2xl mb-3"><ShoppingBag size={32} className="opacity-40" /></div>
              <p className="font-medium text-slate-500 text-sm">{t("sales.no_sales")}</p>
              {!search && filter === "all" && !hasDateFilter && (
                <button onClick={() => openCreateModal()} className="mt-4 flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition hover:opacity-90" style={{ background: "#0a66c2" }}>
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
                <h2 className="text-sm font-semibold text-slate-800">{t("sales.debts_tracker")}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {pendingDebts.length} {t("common.pending")} ·{" "}
                  <span className="text-orange-600 font-semibold">{debtsTotalOutstanding.toLocaleString()} {currency}</span> {t("sales.outstanding").toLowerCase()}
                </p>
              </div>
            </div>
            <button
              onClick={() => { setEditingDebt(null); setDebtForm({ debtor_name: "", phone: "", amount_owed: "", amount_paid: "0", notes: "" }); setShowDebtModal(true); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90"
              style={{ background: "#0a66c2" }}
            >
              <Plus size={13} /> {t("sales.add_debt")}
            </button>
          </div>

          {debtsLoading ? (
            <div className="px-5 py-8 text-center text-xs text-slate-400">{t("sales.loading_debts")}</div>
          ) : debts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <CheckCircle2 size={32} className="mb-2 text-green-300" />
              <p className="text-sm font-medium text-slate-500">{t("sales.no_debts")}</p>
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
                            ? <span className="text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded">{t("sales.paid_badge")}</span>
                            : <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded">{t("sales.pending_badge")}</span>
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
                          <span className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">{Math.round(pct)}% {t("sales.paid_suffix")}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">{t("sales.owed_label")}</p>
                        <p className="font-bold text-slate-800 tabular-nums">{d.amount_owed.toLocaleString()}</p>
                        {d.amount_paid > 0 && (
                          <>
                            <p className="text-xs text-slate-400 mt-0.5">{t("sales.paid_label")}</p>
                            <p className="text-green-600 font-semibold tabular-nums text-sm">{d.amount_paid.toLocaleString()}</p>
                          </>
                        )}
                        {!d.is_paid && (
                          <>
                            <p className="text-xs text-slate-400 mt-0.5">{t("sales.balance_label")}</p>
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
                          <Wallet size={12} /> {t("sales.record_payment")}
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingDebt(d); setDebtForm({ debtor_name: d.debtor_name, phone: d.phone || "", amount_owed: String(d.amount_owed), amount_paid: String(d.amount_paid), notes: d.notes || "" }); setShowDebtModal(true); }}
                        className="flex items-center gap-1 text-xs font-semibold bg-[#EBF2FD] hover:bg-[#D5E8FB] text-[#0a66c2] px-2.5 py-1.5 rounded-lg transition"
                      >
                        <Pencil size={12} /> {t("common.edit")}
                      </button>
                      <button
                        onClick={() => deleteDebt(d.id)}
                        disabled={deletingDebtId === d.id}
                        className="flex items-center gap-1 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40"
                      >
                        <Trash2 size={12} /> {t("common.delete")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PROFORMA SECTION */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-6">
          <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg"><FileText size={17} className="text-blue-500" /></div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">{t("sales.proforma_invoices")}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{proformas.length} {t("sales.recent_suffix")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/proforma?view=history"
                className="text-xs font-semibold text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg transition">
                {t("dash.view_all")}
              </Link>
              <Link href="/proforma"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90" style={{ background: "#0a66c2" }}>
                <Plus size={13} /> {t("sales.new_proforma")}
              </Link>
            </div>
          </div>

          {proformasLoading ? (
            <div className="px-5 py-8 text-center text-xs text-slate-400">{t("sales.loading_proformas")}</div>
          ) : proformas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <FileText size={32} className="mb-2 text-slate-200" />
              <p className="text-sm font-medium text-slate-500">{t("sales.no_proformas")}</p>
              <Link href="/proforma"
                className="mt-3 flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition hover:opacity-90" style={{ background: "#0a66c2" }}>
                <Plus size={12} /> {t("sales.create_proforma")}
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {proformas.map((p) => {
                const meta = PROFORMA_STATUS_META[p.status] ?? PROFORMA_STATUS_META.draft;
                return (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm text-blue-700">{p.invoice_no}</span>
                        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>{t(meta.labelKey)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                        <span className="font-medium text-slate-700 truncate max-w-40">
                          {p.customer || <span className="italic text-slate-300">{t("sales.no_customer")}</span>}
                        </span>
                        <span className="flex items-center gap-1"><Calendar size={10} /> {p.date}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-800 tabular-nums">
                        {p.grand_total.toLocaleString()} <span className="text-xs font-normal text-slate-400">{p.currency}</span>
                      </p>
                      <p className="text-[10px] text-slate-400">{p.lines.length} {t(p.lines.length !== 1 ? "common.item_plural" : "common.item_singular")}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Link href={`/proforma?edit=${p.id}`} title={t("common.edit")}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition">
                        <Pencil size={14} />
                      </Link>
                      <button onClick={() => handleDeleteProforma(p.id)} disabled={deletingProformaId === p.id} title={t("common.delete")}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition disabled:opacity-40">
                        <Trash2 size={14} />
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
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !submitting) { e.preventDefault(); submitForm(); } }}>
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{t("sales.add_title")}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{t("sales.add_items_subtitle")}</p>
                </div>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>

              <div className="px-6 py-4 overflow-y-auto flex-1">

                {/* Line items */}
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t("nav.items")}</span>
                    <button onClick={addLine}
                      className="flex items-center gap-1 text-xs font-semibold text-[#0a66c2] bg-[#EBF2FD] hover:bg-[#D5E8FB] px-2.5 py-1 rounded-lg transition">
                      <Plus size={12} /> {t("items.add")}
                    </button>
                  </div>

                  <div className="hidden sm:grid grid-cols-[2fr_80px_100px_90px_32px] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold uppercase text-slate-400 tracking-wide">
                    <span>{t("sales.product")}</span><span className="text-center">{t("sales.col_qty")}</span><span className="text-center">{t("sales.unit_price")}</span><span className="text-right">{t("proforma.subtotal")}</span><span />
                  </div>

                  <div className="divide-y divide-slate-100">
                    {lineItems.map((line, idx) => {
                      const p = productMap[line.product_id];
                      const subtotal = line.quantity * line.unit_price;
                      const profit = prof && p && p.cost_price != null ? (line.unit_price - p.cost_price) * line.quantity : 0;
                      return (
                        <div key={line.id} className="px-3 py-2">
                          {/* Phone: product on its own row, then qty · price · total. */}
                          <div className="grid grid-cols-[64px_1fr_1fr_32px] sm:grid-cols-[2fr_80px_100px_90px_32px] gap-2 items-center">
                            <ProductPicker
                              className={line.product_id ? "col-span-4 sm:col-span-1" : "col-span-4 sm:col-span-5"}
                              selected={p}
                              onSelect={(prod) => setLineProduct(line.id, prod)}
                              disableOutOfStock
                              autoOpen={idx === 0 && autoPick}
                            />
                            {/* An empty line is just the search box until a product is picked. */}
                            {line.product_id && <>
                            <input type="number" min="1" max={p?.quantity} value={line.quantity} aria-label={t("sales.col_qty")}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setLineQty(line.id, Number(e.target.value), p?.quantity)}
                              className="border border-slate-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition w-full" />
                            <input type="number" min="0" value={line.unit_price} aria-label={t("sales.unit_price")}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setLinePrice(line.id, Number(e.target.value))}
                              className="border border-slate-200 text-gray-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition w-full" />
                            <div className="text-right">
                              <p className="font-semibold text-slate-800 text-sm tabular-nums">{subtotal.toLocaleString()}</p>
                              {prof && p && <p className={`text-xs tabular-nums ${profit >= 0 ? "text-green-500" : "text-red-400"}`}>
                                {profit >= 0 ? "+" : ""}{profit.toLocaleString()}
                              </p>}
                            </div>
                            <button onClick={() => removeLine(line.id)} disabled={lineItems.length === 1 || !line.product_id} aria-label={t("common.delete")}
                              className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition disabled:opacity-20">
                              <X size={14} />
                            </button>
                            </>}
                          </div>
                          {p && (
                            <div className="flex gap-3 mt-1.5 text-[10px] text-slate-400">
                              {fin && p.cost_price != null && <span>{t("items.col_cost")}: <span className="font-medium">{p.cost_price.toLocaleString()}</span></span>}
                              <span>{t("items.col_selling")}: <span className="font-medium text-green-600">{p.selling_price.toLocaleString()}</span></span>
                              <span className={p.quantity <= lowStock ? "text-amber-500 font-medium" : ""}>{t("sales.stock_label")}: {p.quantity}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex justify-end gap-6">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t("proforma.grand_total")}</p>
                      <p className="font-bold text-lg text-slate-800 tabular-nums">{createGrandTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">{currency}</span></p>
                    </div>
                    {prof && <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t("sales.est_profit")}</p>
                      <p className={`font-bold text-lg tabular-nums ${createGrandProfit >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {createGrandProfit >= 0 ? "+" : ""}{createGrandProfit.toLocaleString()}
                      </p>
                    </div>}
                  </div>
                </div>
                {/* Car companies: the buyer, all four details required */}
                {isCar && (
                  <div className="mb-4 rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t("sales.buyer_title")} <span className="text-red-500">*</span></p>
                        <p className="text-xs text-slate-500">{t("sales.buyer_hint")}</p>
                      </div>
                      <select className={`${inputCls} sm:max-w-[280px]`} value={saleCustomer} onChange={(e) => setSaleCustomerAndDebtor(e.target.value)} aria-label={t("sales.buyer_existing")}>
                        <option value="">{t("sales.buyer_new")}</option>
                        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                      </select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([
                        ["name", t("sales.buyer_full_name"), "", "text"],
                        ["phone", t("sales.buyer_phone"), "07XXXXXXXX", "tel"],
                        ["id_number", t("sales.buyer_id"), "1 1990 8 0000000 0 00", "text"],
                        ["address", t("sales.buyer_address"), t("sales.buyer_address_placeholder"), "text"],
                      ] as const).map(([key, label, ph, mode]) => {
                        const missing = buyerTried && !buyer[key].trim();
                        return (
                          <div key={key}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">{label} <span className="text-red-500">*</span></label>
                            <input className={`${inputCls} ${missing ? "border-red-400 ring-2 ring-red-200" : ""}`} placeholder={ph}
                              inputMode={mode === "tel" ? "tel" : undefined}
                              value={buyer[key]} onChange={(e) => setBuyer((b) => ({ ...b, [key]: e.target.value }))} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Payment Method */}
                <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2.5">
                    {t("sales.payment_method")}
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(m.value); setAmountSent("");
                          // On credit, the chosen customer is the debtor — no retyping.
                          const c = customers.find((x) => x.id === saleCustomer);
                          setDebtorName(m.value === "debt" && c ? c.name : "");
                          setDebtorPhone(m.value === "debt" && c ? c.phone || "" : "");
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          paymentMethod === m.value
                            ? m.color + " ring-2 ring-offset-1 ring-current"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {t(m.labelKey)}
                      </button>
                    ))}
                  </div>

                  {paymentMethod !== "debt" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {t("sales.amount_sent")} <span className="text-slate-400 font-normal">{t("sales.amount_sent_hint")}</span>
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number" min="0" placeholder="0"
                          className={inputCls}
                          value={amountSent}
                          onChange={(e) => setAmountSent(e.target.value)}
                        />
                        {createGrandTotal > 0 && (
                          <button type="button" onClick={() => setAmountSent(String(createGrandTotal))}
                            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition whitespace-nowrap">
                            {t("sales.exact_amount")}
                          </button>
                        )}
                        {changeAmount > 0 && (
                          <div className="shrink-0 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm whitespace-nowrap">
                            {t("sales.change_label")}: <span className="font-bold text-green-700">{changeAmount.toLocaleString()} {currency}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {paymentMethod === "debt" && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {t("sales.debtor_name")} <span className="text-red-400">*</span>
                        </label>
                        <input
                          className={inputCls} placeholder={t("sales.debtor_name_placeholder")}
                          value={debtorName} onChange={(e) => setDebtorName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.phone_optional")}</label>
                        <input
                          className={inputCls} placeholder="+250 7XX XXX XXX"
                          value={debtorPhone} onChange={(e) => setDebtorPhone(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                        &#9888; {t("sales.debt_warning")}
                      </div>
                    </div>
                  )}
                </div>

                {/* Customer + Notes */}
                <div className={`grid gap-4 mb-4 ${isCar ? "" : "md:grid-cols-2"}`}>
                  {!isCar && <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("sales.customer")}</label>
                    <select className={inputCls} value={saleCustomer} onChange={(e) => setSaleCustomerAndDebtor(e.target.value)}>
                      <option value="">{t("sales.walkin_customer")}</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                    </select>
                  </div>}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{t("common.notes")}</label>
                    <input className={inputCls} placeholder={t("sales.note_placeholder")}
                      value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} />
                  </div>
                </div>

              </div>

              <div className="flex justify-between items-center gap-2.5 px-6 py-4 border-t border-slate-100 shrink-0">
                <span className="hidden text-xs text-slate-400 sm:inline">{t("sales.shortcut_hint")}</span>
                <div className="flex gap-2.5">
                  <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
                  <button onClick={submitForm} disabled={submitting}
                    className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90" style={{ background: "#0a66c2" }}>
                    {submitting ? t("common.saving") : `${t("sales.add")}${createGrandTotal > 0 ? ` · ${createGrandTotal.toLocaleString()} ${currency}` : ""}`}
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
                  <ProductPicker selected={selectedProduct} onSelect={onProductChange} disableOutOfStock />
                  {selectedProduct && (
                    <div className="mt-1.5 flex gap-3 text-xs text-slate-500">
                      {fin && selectedProduct.cost_price != null && <span>{t("items.cost_price")}: <span className="font-medium text-slate-700">{selectedProduct.cost_price.toLocaleString()}</span></span>}
                      <span>{t("items.selling_price")}: <span className="font-medium text-green-600">{selectedProduct.selling_price.toLocaleString()}</span></span>
                      <span className={`font-medium ${selectedProduct.quantity <= lowStock ? "text-amber-600" : "text-slate-700"}`}>{t("items.col_qty")}: {selectedProduct.quantity}</span>
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.customer")}</label>
                  <select className={inputCls} value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                    <option value="">-</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
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
                    {prof && selectedProduct && selectedProduct.cost_price != null && (
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
                  className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90" style={{ background: "#0a66c2" }}>
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
                <h2 className="text-sm font-semibold text-slate-800">{editingDebt ? t("sales.edit_debt") : t("sales.add_debt")}</h2>
                <button onClick={() => { setShowDebtModal(false); setEditingDebt(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={16} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.debtor_name")} <span className="text-red-400">*</span></label>
                  <input className={inputCls} placeholder={t("sales.debtor_name_placeholder")}
                    value={debtForm.debtor_name} onChange={(e) => setDebtForm({ ...debtForm, debtor_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("common.phone")}</label>
                  <input className={inputCls} placeholder="+250 7XX XXX XXX"
                    value={debtForm.phone} onChange={(e) => setDebtForm({ ...debtForm, phone: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.amount_owed")} <span className="text-red-400">*</span></label>
                    <input type="number" min="0" className={inputCls} placeholder="0"
                      value={debtForm.amount_owed} onChange={(e) => setDebtForm({ ...debtForm, amount_owed: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.amount_paid_so_far")}</label>
                    <input type="number" min="0" className={inputCls} placeholder="0"
                      value={debtForm.amount_paid} onChange={(e) => setDebtForm({ ...debtForm, amount_paid: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("common.notes")}</label>
                  <input className={inputCls} placeholder={t("common.optional")}
                    value={debtForm.notes} onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-slate-100">
                <button onClick={() => { setShowDebtModal(false); setEditingDebt(null); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
                <button onClick={submitDebt} disabled={debtSubmitting}
                  className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90" style={{ background: "#0a66c2" }}>
                  {debtSubmitting ? t("common.saving") : (editingDebt ? t("common.save") : t("sales.add_debt"))}
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
                <h2 className="text-sm font-semibold text-slate-800">{t("sales.record_payment")}</h2>
                <button onClick={() => setShowPayModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={16} /></button>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-slate-500 mb-3">
                  <span className="font-semibold text-slate-700">{showPayModal.debtor_name}</span> {t("sales.owes_word")}{" "}
                  <span className="font-bold text-orange-600">{showPayModal.balance.toLocaleString()} {currency}</span>
                </p>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("sales.amount_paying_now")} <span className="text-red-400">*</span></label>
                <input
                  type="number" min="0" max={showPayModal.balance}
                  className={inputCls} placeholder="0" autoFocus
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
                {paymentAmount && Number(paymentAmount) >= showPayModal.balance && (
                  <p className="mt-2 text-xs text-green-600 font-medium">{t("sales.fully_settle")}</p>
                )}
              </div>
              <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-slate-100">
                <button onClick={() => setShowPayModal(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
                <button onClick={recordPayment} disabled={!paymentAmount || payingDebtId === showPayModal.id}
                  className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 hover:opacity-90" style={{ background: "#0a66c2" }}>
                  {payingDebtId === showPayModal.id ? t("common.saving") : t("sales.confirm_payment")}
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
                  <span className="font-semibold text-sm">{t("sales.receipt_preview_title")}</span>
                </div>
                <button onClick={() => setReceipts([])} className="text-slate-400 hover:text-slate-600 transition"><X size={16} /></button>
              </div>

              <div className="px-6 py-5 font-mono text-sm bg-white max-h-96 overflow-y-auto">
                <div className="text-center mb-4">
                  <p className="font-bold text-base text-slate-900 uppercase tracking-widest">{shop?.name || shopName}</p>
                  {formatPublicAddress(shop?.address) && <p className="text-xs text-slate-500 mt-0.5">{formatPublicAddress(shop?.address)}</p>}
                  {shop?.phone && <p className="text-xs text-slate-500 mt-0.5">{shop.phone}</p>}
                  <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-wider">{t("sales.receipt_title")}</p>
                </div>
                <div className="border-t border-dashed border-slate-300 my-3" />
                <div className="space-y-1.5 text-xs text-slate-600 mb-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("sales.receipt_no")}</span>
                    <span className="font-semibold">{receipts[0]?.id?.slice(0, 8)?.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("common.date")}</span>
                    <span>{receipts[0]?.created_at ? new Date(receipts[0].created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>
                  {receipts[0]?.customer_id && customerMap[receipts[0].customer_id] && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t("sales.col_customer")}</span>
                      <span className="font-medium">{customerMap[receipts[0].customer_id].name}</span>
                    </div>
                  )}
                  {receipts[0]?.payment_method && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t("sales.payment")}</span>
                      <span className="font-semibold uppercase">{receipts[0].payment_method}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-dashed border-slate-300 my-3" />
                <div className="space-y-2 mb-3">
                  {receipts.map((s) => (
                    <div key={s.id}>
                      <p className="font-bold text-slate-800 text-xs">{s.product_name || t("sales.receipt_item")}</p>
                      <div className="flex justify-between text-xs text-slate-600 mt-0.5">
                        <span>{s.quantity} × {s.unit_price.toLocaleString()} {currency}</span>
                        <span className="font-semibold">{s.total_amount.toLocaleString()} {currency}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-300 my-3" />
                <div className="flex justify-between font-bold text-base text-slate-900">
                  <span>{t("common.total")}</span>
                  <span>{receipts.reduce((s, x) => s + x.total_amount, 0).toLocaleString()} {currency}</span>
                </div>
                {receipts[0]?.amount_paid != null && receipts[0].amount_paid > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-slate-600 mt-1.5">
                      <span>{t("sales.amount_paid")}</span>
                      <span>{receipts[0].amount_paid.toLocaleString()} {currency}</span>
                    </div>
                    {receipts[0].amount_paid > receipts.reduce((s, x) => s + x.total_amount, 0) && (
                      <div className="flex justify-between text-xs text-green-600 font-semibold mt-0.5">
                        <span>{t("sales.change_label")}</span>
                        <span>{(receipts[0].amount_paid - receipts.reduce((s, x) => s + x.total_amount, 0)).toLocaleString()} {currency}</span>
                      </div>
                    )}
                  </>
                )}
                {receipts[0]?.payment_method === "debt" && (
                  <div className="mt-2 text-xs text-orange-600 font-semibold text-center border border-orange-200 rounded-lg py-1">&#9888; {t("sales.on_credit_amount_owed")}</div>
                )}
                <div className="border-t border-dashed border-slate-300 my-3" />
                <p className="text-center text-xs text-slate-400">{t("sales.thank_you")}</p>
              </div>

              <div className="flex gap-2 px-3 py-2 border-t border-slate-100 bg-slate-50">
                <button onClick={() => { setReceipts([]); openCreateModal(); }}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-100 transition">
                  {t("dash.new_sale")}
                </button>
                <button onClick={() => setReceipts([])}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-100 transition">
                  {t("common.close")}
                </button>
                <button onClick={() => printReceiptPopup(receipts)}
                  className="flex-1 px-3 py-2 rounded-lg text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 hover:opacity-90" style={{ background: "#0a66c2" }}>
                  <Printer size={13} /> {t("common.print")}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function SalesSkeleton() {
  return (
    <div className="min-h-screen">
      <style>{`@keyframes sal-sh{0%{background-position:-200% 0}100%{background-position:200% 0}}.sal-sh{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:sal-sh 1.4s infinite;border-radius:5px}.sal-sh-w{background:linear-gradient(90deg,rgba(255,255,255,.1) 25%,rgba(255,255,255,.22) 50%,rgba(255,255,255,.1) 75%);background-size:200% 100%;animation:sal-sh 1.4s infinite;border-radius:5px}`}</style>
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">
        <div className="hgv-surface relative rounded-2xl mb-2 overflow-hidden" style={{background:"linear-gradient(135deg,#0a66c2 0%,#004182 50%,#00376b 100%)"}}>
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="w-8 h-8 rounded-xl sal-sh-w shrink-0" />
            <div><div className="sal-sh-w h-2 w-10 mb-1 rounded" /><div className="sal-sh-w h-4 w-28 rounded" /></div>
            <div className="ml-auto flex gap-1.5"><div className="sal-sh-w w-7 h-7 rounded-lg" /><div className="sal-sh-w h-7 w-24 rounded-lg" /></div>
          </div>
          <div className="px-4 pb-2 flex gap-1.5"><div className="sal-sh-w h-2 w-4 rounded-full" /><div className="sal-sh-w h-2 w-40 rounded" /></div>
          <div className="px-4 pb-3 space-y-2">
            <div className="flex gap-2"><div className="sal-sh-w flex-1 h-9 rounded-xl" /><div className="sal-sh-w h-9 w-28 rounded-xl" /></div>
            <div className="sal-sh-w h-9 w-full rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 mb-2">
          {Array.from({length:5}).map((_,i)=>(
            <div key={i} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="sal-sh h-2 w-14 mb-2 rounded" /><div className="sal-sh h-6 w-12 rounded" />
            </div>
          ))}
        </div>
        <div className="sal-sh h-9 rounded-xl mb-2" />
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
          <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div className="sal-sh h-2.5 w-28 rounded" />
            <div className="flex gap-1.5">{[56,52,50,46].map((w,i)=><div key={i} className="sal-sh h-5 rounded" style={{width:w}} />)}</div>
          </div>
          <div className="flex gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
            {[80,100,80,60,40,55,64,80,64,40].map((w,i)=><div key={i} className="sal-sh h-2 rounded" style={{width:w}} />)}
          </div>
          {Array.from({length:8}).map((_,i)=>(
            <div key={i} className="flex items-center gap-2 border-b border-slate-50 border-l-2 border-l-slate-200" style={{padding:"6px 12px"}}>
              <div><div className="sal-sh h-2.5 w-16 rounded mb-1" /><div className="sal-sh h-2 w-10 rounded" /></div>
              <div><div className="sal-sh h-2.5 w-24 rounded mb-1" /><div className="sal-sh h-2 w-16 rounded" /></div>
              {[60,52,40,36,52,60,52,28].map((w,j)=><div key={j} className="sal-sh h-2.5 rounded shrink-0" style={{width:w}} />)}
            </div>
          ))}
        </div>
        <div className="sal-sh h-32 rounded-xl" />
      </div>
    </div>
  );
}
