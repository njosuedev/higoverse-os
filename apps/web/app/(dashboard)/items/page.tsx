"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isZero } from "@/lib/format";
import Link from "next/link";
import { itemRequest } from "@/lib/product-api";
import { partnerRequest } from "@/lib/supplier-api";
import { useAutoRefresh, useDebounce } from "@/lib/hooks";
import { useLanguage } from "@/lib/language-context";
import { VEHICLE_FIELDS, VEHICLE_ID_FIELDS, carTypeLabel, duplicateVehicle, normalizeVehicleId, parseAttributes, stringifyAttributes, type Attributes } from "@/lib/business-layout";
import { useShopSettings } from "@/lib/shop-settings-context";
import { parseImages, shrinkDataUrl } from "@/lib/image";
import CarImagesPicker from "@/app/components/items/CarImagesPicker";
import CarGallery from "@/app/components/items/CarGallery";
import VehicleGrid from "@/app/components/items/VehicleGrid";
import DeepLink from "@/app/components/DeepLink";
import Pagination from "@/app/components/ui/Pagination";
import { useCanSeeFinancials, useShowsProfit } from "@/lib/permissions";
import {
  Package, AlertCircle, Search, Filter, Plus, Trash2, Pencil, X, ShoppingCart,
  TrendingUp, TrendingDown, RefreshCw, ChevronDown,
  FileSpreadsheet, FileText, Upload, Download, CheckCircle, XCircle, Car, PackagePlus, LayoutGrid, List,
} from "lucide-react";
import { askConfirm, notify } from "@/lib/dialogs";

interface Product {
  id: string;
  name: string;
  description?: string;
  cost_price: number;
  selling_price: number;
  quantity: number;
  supplier_id?: string | null;
  /** JSON text of layout-specific fields (car layout: make, model, VIN…). */
  attributes?: string | null;
  /** Small data-URL of the first photo (lists don't carry full images). */
  thumbnail?: string | null;
  profit_status?: "profit" | "loss";
  profit_money?: number;
  created_at?: string;
}

interface Supplier { id: string; name: string; phone?: string; address?: string; }
type ModalMode = "create" | "edit";

const EMPTY_FORM = {
  name: "", description: "", cost_price: "", selling_price: "", quantity: "", supplier_id: "",
  attributes: {} as Attributes,
  images: [] as string[],
};

/** "Plate RAC 123 A · Chassis …" line under a car's name. */
function carIds(a: Attributes): string {
  return [a.plate_no && `Plate ${a.plate_no}`, a.chassis_no && `Chassis ${a.chassis_no}`].filter(Boolean).join(" · ");
}

const PAGE_SIZES = [25, 50, 100, 250];

interface InventorySummary {
  total_products: number; low_stock: number; out_of_stock: number;
  cost_value: number; potential_profit: number;
  pending?: number; with_penalties?: number;
}

// Filter dropdown value → the API's `stock` parameter.
const STOCK_PARAM: Record<string, string> = { in_stock: "in", low_stock: "low", out_stock: "out", restock: "restock" };
// Car companies filter by sale status instead (the API's `status` parameter).
const CAR_STATUS: Record<string, string> = { available: "available", pending: "pending", sold: "sold", penalties: "penalties", incomplete: "incomplete" };

// Table or cards for car companies — a per-device preference, list by default.
const VIEW_KEY = "hgv_vehicle_view";
type VehicleView = "cards" | "list";
function readVehicleView(): VehicleView {
  try { return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list"; } catch { return "list"; }
}

// The API caps a page at 1000 rows; exports walk every page.
const EXPORT_PAGE = 1000;

export default function ItemManagementPage() {
  const { t, layout } = useLanguage();
  const isCar = layout === "car";
  // Car companies keep stock value and profit figures from their staff.
  const fin = useCanSeeFinancials();
  // Car companies never show profit, loss or margins (owners included).
  const prof = useShowsProfit();
  // One page of products, already searched/filtered/paged by the API.
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [alertItems, setAlertItems] = useState<Product[]>([]);
  const [exporting, setExporting] = useState(false);
  const requestId = useRef(0);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  // The dashboard deep-links here with ?stock=low (restock list) or ?add=1 (new product).
  const [filter, setFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  // Stock in (car companies restock here; they have no Purchases page).
  const [stockInItem, setStockInItem] = useState<Product | null>(null);
  const [stockInQty, setStockInQty]   = useState("");
  const [stockingIn, setStockingIn]   = useState(false);

  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState<{
    success: number;
    failed: { row: number; name: string; reason: string }[];
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(search, 350);

  useEffect(() => {
    loadSuppliers();
  }, []);

  // Settings → low stock threshold, and the company's own car types
  // (offered after the built-in ones).
  const { lowStock, currency, carTypes: customCarTypes } = useShopSettings();
  const [galleryFor, setGalleryFor] = useState<Product | null>(null);
  const [vehicleView, setVehicleView] = useState<VehicleView>(() => (typeof window === "undefined" ? "list" : readVehicleView()));
  function chooseView(v: VehicleView) {
    setVehicleView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* preference only */ }
  }
  // A link can open one product (?open=<id>): it's shown on its own (as a
  // card for car companies) until "Show all". `autoForm` then opens that
  // car's fines or pending form once its card is on screen.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [autoForm, setAutoForm] = useState<{ id: string; form: "fines" | "pending" } | null>(null);
  const showCards = isCar && (vehicleView === "cards" || !!focusId);
  const [loadingEdit, setLoadingEdit] = useState(false);
  // Keep figures current without polling hidden tabs.
  useAutoRefresh(() => loadData(true));

  function manualRefresh() {
    loadData(true);
  }

  function listQuery(pageNo: number, limit: number) {
    const qs = new URLSearchParams({ page: String(pageNo), limit: String(limit), threshold: String(lowStock) });
    if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim());
    if (isCar && CAR_STATUS[filter]) qs.set("status", CAR_STATUS[filter]);
    // A sold car has left the stock: by default only cars still owned show.
    else if (isCar) qs.set("status", "in_stock");
    else if (STOCK_PARAM[filter]) qs.set("stock", STOCK_PARAM[filter]);
    return qs.toString();
  }

  async function loadSuppliers() {
    try {
      const res = await partnerRequest("/suppliers");
      const allPartners: Supplier[] = res?.data?.items || res?.data || [];
      setSuppliers(allPartners.filter((p) => p.address?.startsWith("TIN:")));
    } catch { /* supplier names are optional in the table */ }
  }

  async function loadData(soft = false) {
    const id = ++requestId.current;
    try {
      if (!soft) setLoading(true); else setRefreshing(true);
      const [listRes, summaryRes, alertsRes] = await Promise.all([
        focusId ? itemRequest(`/products/${focusId}`) : itemRequest(`/products?${listQuery(page, pageSize)}`),
        itemRequest(`/products/summary?threshold=${lowStock}`),
        itemRequest(`/products/stock-alerts?threshold=${lowStock}`),
      ]);
      if (id !== requestId.current) return; // a newer search/page already answered
      const items: Product[] = focusId
        ? (listRes?.data ? [listRes.data] : [])
        : listRes?.data?.items || []; // newest first, ordered by the API
      const count: number = focusId ? items.length : listRes?.data?.total ?? 0;
      // Deleting the last row of the last page — step back to a page that exists.
      if (items.length === 0 && page > 1 && count > 0) { setPage(Math.ceil(count / pageSize)); return; }
      setProducts(items);
      setTotal(count);
      setSummary(summaryRes?.data ?? null);
      setAlertItems(alertsRes?.data ?? []);
      setLastUpdated(new Date());
      setLoadError(false);
    } catch (err) {
      // Already surfaced to the user via the banner below — console.warn
      // (not .error) so it doesn't retrigger Next's dev-overlay redbox.
      console.warn(err);
      if (id === requestId.current) setLoadError(true);
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }

  // First load shows the skeleton; later page/search/filter changes keep the
  // table on screen and just show the refresh spinner.
  const loadedOnce = useRef(false);
  useEffect(() => {
    loadData(loadedOnce.current);
    loadedOnce.current = true;
  }, [page, pageSize, debouncedSearch, filter, lowStock, focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Every product matching the current search/filter, for exports. */
  async function fetchAllMatching(): Promise<Product[]> {
    const all: Product[] = [];
    for (let pageNo = 1; ; pageNo++) {
      const res = await itemRequest(`/products?${listQuery(pageNo, EXPORT_PAGE)}`);
      const items: Product[] = res?.data?.items || [];
      all.push(...items);
      if (items.length < EXPORT_PAGE || all.length >= (res?.data?.total ?? 0)) return all;
    }
  }

  // Dashboard links: /items?stock=low (restock list), /items?add=1 (new product),
  // /items?status=pending|penalties|incomplete (car watch lists).
  function handleDeepLink(params: URLSearchParams) {
    // Dashboard/report circles: /items?open=<id>[&do=edit|fines|pending|stockin]
    const open = params.get("open");
    if (open) {
      const act = params.get("do");
      setFocusId(open); setPage(1);
      if (act === "edit" || act === "stockin") {
        itemRequest(`/products/${open}`)
          .then((res) => {
            const p = res?.data as Product | undefined;
            if (!p) return;
            if (act === "edit") openEditModal(p);
            else { setStockInItem(p); setStockInQty(""); }
          })
          .catch(() => {});
      }
      if (act === "fines" || act === "pending") setAutoForm({ id: open, form: act });
    }
    const st = params.get("status");
    if (st && CAR_STATUS[st]) { setFilter(st); setPage(1); }
    if (params.get("stock") === "low") { setFilter(isCar ? "all" : "restock"); setPage(1); }
    if (params.get("add") === "1") openCreateModal();
  }

  function openCreateModal() {
    // Each car is one vehicle (unique chassis and plate), so it's added as 1.
    setForm(isCar ? { ...EMPTY_FORM, quantity: "1" } : EMPTY_FORM); setEditingId(null); setModalMode("create");
    setShowModal(true);
  }

  function openEditModal(p: Product) {
    const fill = (x: Product & { images?: string | null }) => setForm({
      name: x.name, description: x.description || "",
      cost_price: String(x.cost_price), selling_price: String(x.selling_price),
      quantity: String(x.quantity), supplier_id: x.supplier_id || "",
      attributes: parseAttributes(x.attributes),
      images: parseImages(x.images),
    });
    fill(p);
    setEditingId(p.id); setModalMode("edit"); setShowModal(true);
    if (isCar) {
      // Lists don't carry photos — fetch this car in full (also gets the latest quantity).
      setLoadingEdit(true);
      itemRequest(`/products/${p.id}`)
        .then((res) => { if (res?.data) fill({ ...p, ...res.data }); })
        .catch(() => {})
        .finally(() => setLoadingEdit(false));
    }
  }

  function closeModal() {
    setShowModal(false); setForm(EMPTY_FORM); setEditingId(null);
  }

  async function submitForm() {
    if (isCar) {
      const missing = VEHICLE_FIELDS.some((f) => f.required && !String(form.attributes[f.key] ?? "").trim());
      if (!form.name.trim() || !form.selling_price || !form.quantity || missing) {
        notify(t("vehicle.err_required")); return;
      }
      if (!(Number(form.selling_price) > 0) || !(Number(form.quantity) >= 0)) {
        notify(t("vehicle.err_price")); return;
      }
    } else if (!form.name.trim() || !form.cost_price || !form.selling_price || !form.quantity) {
      notify(t("items.validation_required")); return;
    }
    const thumbnail = isCar && form.images[0] ? await shrinkDataUrl(form.images[0]).catch(() => "") : "";
    const payload = {
      name: form.name.trim(), description: form.description.trim() || null,
      // Car companies don't track cost; the API requires one, so store the
      // price as cost (profit then reads as zero rather than a fake margin).
      cost_price: Number(isCar ? form.selling_price : form.cost_price), selling_price: Number(form.selling_price),
      quantity: Number(form.quantity), supplier_id: form.supplier_id || null,
      // Only car shops edit attributes; leave other layouts' rows untouched.
      ...(isCar ? {
        attributes: stringifyAttributes({
          ...form.attributes,
          ...Object.fromEntries(VEHICLE_ID_FIELDS.map((k) => [k, normalizeVehicleId(form.attributes[k] ?? "")])),
        }),
        // "" clears them when every photo was removed.
        images: form.images.length ? JSON.stringify(form.images) : "",
        thumbnail,
      } : {}),
    };
    try {
      setSubmitting(true);
      if (modalMode === "edit" && editingId) {
        await itemRequest(`/products/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await itemRequest("/products", { method: "POST", body: JSON.stringify(payload) });
      }
      closeModal(); await loadData(true);
    } catch (err) {
      const dup = duplicateVehicle(err);
      if (dup) { notify(`${t(dup.field === "plate_no" ? "vehicle.err_dup_plate" : "vehicle.err_dup_chassis")} "${dup.name}".`); return; }
      console.error(err); notify(modalMode === "edit" ? t("items.update_failed") : t("items.add_failed"));
    } finally { setSubmitting(false); }
  }

  async function submitStockIn() {
    if (!stockInItem) return;
    const add = Number(stockInQty);
    if (!Number.isInteger(add) || add <= 0) { notify(t("items.stock_in_invalid")); return; }
    try {
      setStockingIn(true);
      // Re-read the current quantity so a sale made meanwhile isn't overwritten.
      const fresh = await itemRequest(`/products/${stockInItem.id}`);
      const current = Number(fresh?.data?.quantity ?? stockInItem.quantity);
      await itemRequest(`/products/${stockInItem.id}`, { method: "PUT", body: JSON.stringify({ quantity: current + add }) });
      setStockInItem(null); setStockInQty("");
      await loadData(true);
    } catch (err) {
      console.error(err); notify(t("items.update_failed"));
    } finally { setStockingIn(false); }
  }

  async function deleteProduct(id: string) {
    if (!(await askConfirm({ message: t("items.confirm_delete"), danger: true }))) return;
    try {
      setDeletingId(id);
      await itemRequest(`/products/${id}`, { method: "DELETE" });
      await loadData(true);
    } catch (err) { console.error(err); notify(t("items.delete_failed")); }
    finally { setDeletingId(""); }
  }

  const supplierMap = useMemo(() => {
    const m: Record<string, Supplier> = {};
    suppliers.forEach((s) => { m[s.id] = s; });
    return m;
  }, [suppliers]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginated = products;

  const stats = {
    total: summary?.total_products ?? 0,
    inStock: Math.max(0, (summary?.total_products ?? 0) - (summary?.low_stock ?? 0) - (summary?.out_of_stock ?? 0)),
    lowStock: summary?.low_stock ?? 0,
    outStock: summary?.out_of_stock ?? 0,
    pending: summary?.pending ?? 0,
    withPenalties: summary?.with_penalties ?? 0,
    stockValue: summary?.cost_value ?? 0,
    potentialProfit: summary?.potential_profit ?? 0,
  };

  function buildCarExportRows(rows: Product[]): Record<string, string | number>[] {
    return rows.map((p, i) => {
      const a = parseAttributes(p.attributes);
      return {
        "#": i + 1,
        [t("items.name")]: p.name,
        [t("vehicle.car_type")]: a.car_type ? carTypeLabel(t, a.car_type) : "",
        [t("vehicle.year")]: a.year ?? "",
        [t("vehicle.battery_range")]: a.battery_range ? Number(a.battery_range) : "",
        [t("vehicle.color")]: a.color ?? "",
        [t("vehicle.chassis_no")]: a.chassis_no ?? "",
        [t("vehicle.plate_no")]: a.plate_no ?? "",
        [t("items.quantity")]: p.quantity,
        [t("items.selling_price")]: Number(p.selling_price || 0),
        "Date Added": p.created_at ? new Date(p.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "",
      };
    });
  }

  function buildExportRows(rows: Product[]) {
    return rows.map((p, i) => {
      const supplier = p.supplier_id ? supplierMap[p.supplier_id] : null;
      const cost = Number(p.cost_price || 0);
      const sell = Number(p.selling_price || 0);
      const margin = cost > 0 ? ((sell - cost) / cost) * 100 : 0;
      const totalProfit = (sell - cost) * (p.quantity || 0);
      const status = p.quantity === 0 ? "Out of Stock" : p.quantity <= lowStock ? "Low Stock" : "In Stock";
      return {
        "#": i + 1,
        "Product Name": p.name,
        "Description": p.description || "",
        "Supplier": supplier?.name || "",
        "Cost Price": cost,
        "Selling Price": sell,
        "Margin (%)": parseFloat(margin.toFixed(2)),
        "Quantity": p.quantity,
        "Status": status,
        "Unit Profit": parseFloat((sell - cost).toFixed(2)),
        "Total Profit": parseFloat(totalProfit.toFixed(2)),
        "Date Added": p.created_at ? new Date(p.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "",
      };
    });
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const [{ utils, writeFile }, all] = await Promise.all([import("xlsx"), fetchAllMatching()]);
      const rows = isCar ? buildCarExportRows(all) : buildExportRows(all);
      const ws = utils.json_to_sheet(rows);
      ws["!cols"] = [4, 28, 24, 20, 14, 14, 12, 10, 14, 14, 14, 22].map((w) => ({ wch: w }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Inventory");
      writeFile(wb, `inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.warn(err); notify(t("items.export_failed"));
    } finally { setExporting(false); }
  }

  async function exportPDF() {
    setExporting(true);
    try { await writePDF(await fetchAllMatching()); }
    catch (err) { console.warn(err); notify(t("items.export_failed")); }
    finally { setExporting(false); }
  }

  async function writePDF(all: Product[]) {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const rows = buildExportRows(all);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Inventory Report", 40, 40);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(`Exported on ${new Date().toLocaleString()} · ${rows.length} items`, 40, 56);
    doc.setTextColor(0);

    if (isCar) {
      const carRows = buildCarExportRows(all);
      autoTable(doc, {
        startY: 68,
        head: [Object.keys(carRows[0] ?? {})],
        body: carRows.map((r) => Object.values(r).map((v) => typeof v === "number" ? v.toLocaleString() : v)),
        styles: { fontSize: 7, cellPadding: 4 },
        headStyles: { fillColor: [10, 102, 194], textColor: 255, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });
      doc.save(`inventory_${new Date().toISOString().slice(0, 10)}.pdf`);
      return;
    }

    autoTable(doc, {
      startY: 68,
      head: [["#", "Product", "Supplier", "Cost", "Sell", "Margin%", "Qty", "Status", "Unit Profit", "Total Profit", "Date Added"]],
      body: rows.map((r) => [
        r["#"], r["Product Name"], r["Supplier"],
        r["Cost Price"].toLocaleString(), r["Selling Price"].toLocaleString(),
        `${r["Margin (%)"] >= 0 ? "+" : ""}${r["Margin (%)"]}%`,
        r["Quantity"], r["Status"],
        r["Unit Profit"].toLocaleString(), r["Total Profit"].toLocaleString(),
        r["Date Added"],
      ]),
      styles: { fontSize: 7, cellPadding: 4 },
      headStyles: { fillColor: [19, 114, 230], textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 20, halign: "center" },
        3: { halign: "right" }, 4: { halign: "right" },
        5: { halign: "right" }, 6: { halign: "center" },
        8: { halign: "right" }, 9: { halign: "right" },
        10: { cellWidth: 54 },
      },
    });

    doc.save(`inventory_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function downloadTemplate() {
    import("xlsx").then(({ utils, writeFile }) => {
      const ws = utils.aoa_to_sheet([["Name *", "Description", "Cost Price *", "Selling Price *", "Quantity *", "Supplier Name"]]);
      ws["!cols"] = [22, 26, 14, 16, 12, 22].map((w) => ({ wch: w }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Products");
      writeFile(wb, "products_import_template.xlsx");
    });
  }

  async function handleImport(file: File) {
    if (!file) return;
    setImportLoading(true);
    setImportResults(null);
    try {
      const { read, utils } = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];

      if (rows.length < 2) { notify(t("items.import_no_rows")); return; }

      const supplierByName: Record<string, string> = {};
      suppliers.forEach((s) => { supplierByName[s.name.toLowerCase()] = s.id; });

      const dataRows = rows.slice(1).filter((r) => (r as unknown[]).some(Boolean));

      const results = await Promise.allSettled(
        dataRows.map(async (row, i) => {
          const [name, description, costPrice, sellingPrice, quantity, supplierName] = row as unknown[];
          const rowNum = i + 2;
          const nameStr = typeof name === "string" ? name.trim() : String(name ?? "").trim();
          if (!nameStr) throw Object.assign(new Error(t("items.err_name_required")), { rowNum, nameStr: nameStr || "(empty)" });
          if (costPrice == null || costPrice === "") throw Object.assign(new Error(t("items.err_cost_required")), { rowNum, nameStr });
          if (sellingPrice == null || sellingPrice === "") throw Object.assign(new Error(t("items.err_selling_required")), { rowNum, nameStr });
          if (quantity == null || quantity === "") throw Object.assign(new Error(t("items.err_qty_required")), { rowNum, nameStr });

          const payload = {
            name: nameStr,
            description: description ? String(description).trim() || null : null,
            cost_price: Number(costPrice),
            selling_price: Number(sellingPrice),
            quantity: Number(quantity),
            supplier_id: supplierName ? (supplierByName[String(supplierName).toLowerCase()] ?? null) : null,
          };
          await itemRequest("/products", { method: "POST", body: JSON.stringify(payload) });
          return nameStr;
        })
      );

      const failed: { row: number; name: string; reason: string }[] = [];
      let success = 0;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          success++;
        } else {
          const err = r.reason as Error & { rowNum?: number; nameStr?: string };
          failed.push({ row: err.rowNum ?? i + 2, name: err.nameStr ?? `Row ${i + 2}`, reason: err.message });
        }
      });

      setImportResults({ success, failed });
      if (success > 0) await loadData(true);
    } catch (err) {
      console.error(err);
      notify(t("items.import_parse_failed"));
    } finally {
      setImportLoading(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  const inputCls =
    "border border-slate-200 text-gray-800 placeholder:text-gray-400 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#0a66c2]/30 focus:border-[#0a66c2] transition";

  /** Built-in options + the company's own car types (+ the saved value, if since removed). */
  function selectOptions(f: (typeof VEHICLE_FIELDS)[number]): string[] {
    const opts = [...(f.options ?? []), ...(f.key === "car_type" ? customCarTypes : [])];
    const current = form.attributes[f.key];
    return current && !opts.includes(current) ? [...opts, current] : opts;
  }

  function renderCarField(f: (typeof VEHICLE_FIELDS)[number]) {
    const value = form.attributes[f.key] ?? "";
    const set = (v: string) => setForm({ ...form, attributes: { ...form.attributes, [f.key]: v } });
    return (
      <div key={f.key}>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {t(`vehicle.${f.key}`)}{" "}
          {f.required ? <span className="text-red-400">*</span> : <span className="text-gray-400 font-normal">({t("common.optional")})</span>}
        </label>
        {f.type === "select" ? (
          <select className={inputCls} value={value} onChange={(e) => set(e.target.value)}>
            <option value="">-</option>
            {selectOptions(f).map((o) => <option key={o} value={o}>{carTypeLabel(t, o)}</option>)}
          </select>
        ) : (
          <input type={f.type} min={f.type === "number" ? "0" : undefined}
            className={VEHICLE_ID_FIELDS.includes(f.key) ? `${inputCls} font-mono uppercase` : inputCls}
            placeholder={f.placeholder} value={value} onChange={(e) => set(e.target.value)} />
        )}
      </div>
    );
  }

  if (loading) return <ItemsSkeleton />;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">

        <DeepLink keys={["stock", "add", "status", "open", "do"]} onParams={handleDeepLink} />

        {/* HEADER BANNER */}
        <div
          className="hgv-surface relative rounded-2xl mb-2 overflow-hidden"
        >

          {/* ── Row 1: title · stat chips · actions ── */}
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">

            {/* Title */}
            <div className="flex items-center gap-2.5 min-w-0 mr-auto">
              <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <Package size={15} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-widest leading-none">{t("nav.inventory")}</p>
                <h1 className="text-base font-extrabold text-white leading-tight tracking-tight">{t("items.title")}</h1>
              </div>
            </div>

            {/* Stat chips — like the reference screenshot */}
            <div className="hidden md:flex items-center gap-2">
              {(isCar ? [
                { label: t("vehicle.status_available"), value: Math.max(0, stats.total - stats.outStock - stats.pending), accent: "text-green-300", highlight: false },
                { label: t("vehicle.status_pending"),   value: stats.pending,  accent: "text-amber-300", highlight: stats.pending > 0 },
                { label: t("vehicle.status_sold"),      value: stats.outStock, accent: "text-white",     highlight: false },
              ] : [
                { label: t("items.in_stock"),  value: stats.inStock,  accent: "text-green-300",  highlight: false },
                { label: t("items.low_stock"),  value: stats.lowStock, accent: "text-amber-300",  highlight: stats.lowStock > 0 },
                { label: t("items.out_stock"),  value: stats.outStock, accent: "text-red-300",    highlight: stats.outStock > 0 },
              ]).map((s) => (
                <div
                  key={s.label}
                  className={`flex flex-col items-center px-3 py-1.5 rounded-xl border min-w-[68px] transition-all
                    ${s.highlight
                      ? "bg-white/20 border-white/30"
                      : "bg-white/10 border-white/15"}`}
                >
                  <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider leading-none">{s.label}</p>
                  <p className={`text-lg font-extrabold leading-tight tabular-nums mt-0.5 ${s.accent}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={manualRefresh}
                disabled={refreshing}
                title={t("common.refresh")}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all disabled:opacity-40"
              >
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button
                onClick={openCreateModal}
                className="flex items-center gap-1.5 bg-white text-[#0a66c2] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 active:scale-95 transition-all shadow-lg shadow-black/20"
              >
                <Plus size={12} strokeWidth={3} /> {t("items.add")}
              </button>
            </div>
          </div>

          {/* ── Row 2: live indicator ── */}
          <div className="relative flex items-center gap-1.5 px-4 pb-2">
            <p className="text-[11px] text-blue-100/70 flex-1">
              {t("items.live_label")} · <span className="font-semibold text-white/80">{stats.total.toLocaleString()} {t("items.count_suffix")}</span>
              {lastUpdated && <span className="ml-1 text-blue-200/50">· {t("common.updated")} {lastUpdated.toLocaleTimeString()}</span>}
            </p>
          </div>

          {/* ── Row 3: search + filter ── */}
          <div className="relative flex gap-2 px-4 pb-3">
            {/* Search */}
            <div className="hgv-search">
              <Search size={16} className="hgv-search-icon" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={t("items.search")}
                className="hgv-search-input"
              />
              {search ? (
                <button
                  onClick={() => setSearch("")}
                  className="hgv-search-clear"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

            {/* Filter */}
            <div className="hgv-filter">
              <Filter size={14} className="shrink-0" />
              <select
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setPage(1); }}
                
              >
                <option value="all" className="text-gray-800">{t(isCar ? "vehicle.in_stock" : "items.all")}</option>
                {isCar ? (<>
                  <option value="available" className="text-gray-800">{t("vehicle.status_available")}</option>
                  <option value="pending" className="text-gray-800">{t("vehicle.status_pending")}</option>
                  <option value="sold" className="text-gray-800">{t("vehicle.status_sold")}</option>
                  <option value="penalties" className="text-gray-800">{t("vehicle.has_fines")}</option>
                  <option value="incomplete" className="text-gray-800">{t("vehicle.incomplete")}</option>
                </>) : (<>
                  <option value="in_stock" className="text-gray-800">{t("items.in_stock")}</option>
                  <option value="restock" className="text-gray-800">{t("dash.needs_restock")}</option>
                  <option value="low_stock" className="text-gray-800">{t("items.low_stock")}</option>
                  <option value="out_stock" className="text-gray-800">{t("items.out_stock")}</option>
                </>)}
              </select>
              <ChevronDown size={14} className="shrink-0" />
            </div>

            {/* Cards / List (car companies) */}
            {isCar && (
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/10 p-1">
                {([["list", List, t("vehicle.view_list")], ["cards", LayoutGrid, t("vehicle.view_cards")]] as const).map(([v, Icon, label]) => (
                  <button key={v} onClick={() => chooseView(v)} aria-pressed={vehicleView === v}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${vehicleView === v ? "bg-white text-[#0a66c2]" : "text-white/80 hover:bg-white/10"}`}>
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* LOAD ERROR BANNER */}
        {loadError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 mb-2">
            <AlertCircle size={11} className="text-red-500 shrink-0" />
            <p className="text-[11px] text-red-700 flex-1 min-w-0">
              {t("items.load_error")}
            </p>
            <button
              onClick={manualRefresh}
              className="text-[11px] font-bold text-red-700 bg-red-100 hover:bg-red-200 px-2 py-0.5 rounded-md shrink-0 transition"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {/* LOW STOCK ALERT */}
        {!isCar && alertItems.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
            <AlertCircle size={11} className="text-amber-500 shrink-0" />
            <p className="text-[11px] text-amber-700 flex-1 min-w-0 sm:truncate">
              <span className="font-bold">{alertItems.length}</span> {t("items.restock_alert")} ·{" "}
              <span className="text-amber-600">{alertItems.slice(0, 3).map((i) => i.name).join(", ")}{alertItems.length > 3 ? ` +${alertItems.length - 3} ${t("items.more")}` : ""}</span>
            </p>
            {!isCar && <Link href="/purchases"
              className="text-[11px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-md shrink-0 transition">
              {t("items.purchase_short")}
            </Link>}
          </div>
        )}

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 mb-2">
          {(isCar ? [
            { label: t("vehicle.in_stock"),         value: Math.max(0, stats.total - stats.outStock), color: "text-slate-900" },
            { label: t("vehicle.status_available"), value: Math.max(0, stats.total - stats.outStock - stats.pending), color: "text-slate-900" },
            { label: t("vehicle.status_pending"),   value: stats.pending,       color: "text-amber-600" },
            { label: t("vehicle.status_sold"),      value: stats.outStock,      color: "text-slate-900" },
            { label: t("vehicle.has_fines"),        value: stats.withPenalties, color: "text-red-600" },
            ...(fin ? [{ label: t("items.stock_value"), value: stats.stockValue.toLocaleString(), color: "text-slate-900" }] : []),
          ] : [
            { label: t("items.total"),       value: stats.total,                            color: "text-slate-900" },
            { label: t("items.in_stock"),    value: stats.inStock,                          color: "text-slate-900" },
            { label: t("items.low_stock"),   value: stats.lowStock,                         color: "text-amber-600" },
            { label: t("items.out_stock"),   value: stats.outStock,                         color: "text-red-600"   },
            ...(fin ? [{ label: t("items.stock_value"), value: stats.stockValue.toLocaleString(),      color: "text-slate-900" }] : []),
            ...(prof ? [{ label: t("items.pot_profit"),  value: stats.potentialProfit.toLocaleString(), color: "text-slate-900" }] : []),
          ]).map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[11px] font-medium text-slate-500 leading-none truncate">{card.label}</p>
              </div>
              <p className={`text-xl font-bold leading-none tabular-nums ${isZero(card.value) ? "text-slate-900" : card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* hidden import file input */}
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
        />

        {/* One product opened from a link */}
        {focusId && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-data border border-ink/30 bg-ink-soft px-3 py-2 text-sm">
            <span className="font-semibold text-ink">{t("items.focus_one")}</span>
            <button onClick={() => { setFocusId(null); setAutoForm(null); }} className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white hover:bg-ink-dark">
              {t("items.show_all")}
            </button>
          </div>
        )}

        {/* VEHICLE CARDS (car companies) or TABLE */}
        {showCards ? (
          <div className="space-y-4">
            {products.length === 0 ? (
              <div className="flex flex-col items-center rounded-data border border-border bg-white py-16 text-center">
                <Car size={36} className="text-text-faint" />
                <p className="mt-3 font-medium text-text">{t("items.no_items")}</p>
                <p className="text-sm text-text-muted">{search || filter !== "all" ? t("common.try_adjust_filters") : t("items.add_first")}</p>
              </div>
            ) : (
              <VehicleGrid
                vehicles={products}
                currency={currency}
                onOpenGallery={(v) => setGalleryFor(products.find((x) => x.id === v.id) ?? null)}
                onEdit={(v) => { const p = products.find((x) => x.id === v.id); if (p) openEditModal(p); }}
                onChanged={() => loadData(true)}
                autoForm={autoForm}
              />
            )}
            <div className="overflow-hidden rounded-data border border-border bg-white">
              <Pagination page={page} totalPages={totalPages} total={total}
                pageSize={pageSize} pageSizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
            </div>
          </div>
        ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Table toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-1.5 border-b border-slate-100 bg-slate-50/60">
            <p className="text-[11px] text-slate-500">
              {t("common.showing")}{" "}
              <span className="font-semibold text-slate-700">{paginated.length.toLocaleString()}</span>{" "}
              {t("common.of")}{" "}
              <span className="font-semibold text-slate-700">{total.toLocaleString()}</span>{" "}
              {t("items.count_suffix")}
              {debouncedSearch && (
                <> {t("common.for")} &ldquo;<span className="font-semibold text-[#0a66c2]">{debouncedSearch}</span>&rdquo;</>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(debouncedSearch || filter !== "all") && (
                <button
                  onClick={() => { setSearch(""); setFilter("all"); setPage(1); }}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition"
                >
                  <X size={10} /> {t("common.clear_filters")}
                </button>
              )}
              {/* Divider */}
              {(debouncedSearch || filter !== "all") && <span className="w-px h-3 bg-slate-200" />}
              {/* Import buttons (retail columns only) */}
              {!isCar && <>
              <button
                onClick={downloadTemplate}
                title={t("common.download_template")}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded transition"
              >
                <Download size={11} /> {t("common.template")}
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importLoading}
                title={t("items.import_title_hint")}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded transition disabled:opacity-50"
              >
                {importLoading ? <RefreshCw size={11} className="animate-spin" /> : <Upload size={11} />}
                {importLoading ? t("common.importing") : t("common.import")}
              </button>
              <span className="w-px h-3 bg-slate-200" />
              </>}
              {/* Export buttons */}
              <button
                onClick={exportExcel}
                disabled={exporting}
                title={t("common.export_excel_hint")}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-2 py-0.5 rounded transition"
              >
                <FileSpreadsheet size={11} /> Excel
              </button>
              <button
                onClick={exportPDF}
                disabled={exporting}
                title={t("common.export_pdf_hint")}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-2 py-0.5 rounded transition"
              >
                <FileText size={11} /> PDF
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {isCar ? (
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-8 px-3 py-2 text-left text-[11px] font-semibold text-slate-400">#</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_product")}</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("vehicle.car_type")}</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("vehicle.year")}</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("vehicle.battery_range")}</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("vehicle.color")}</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_selling")}</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_qty")}</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_added")}</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("common.actions")}</th>
                </tr>
                ) : (
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-8 px-3 py-2 text-left text-[11px] font-semibold text-slate-400">#</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_product")}</th>
                  <th className="hidden lg:table-cell px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{t("items.col_supplier")}</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_cost")}</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_selling")}</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_margin")}</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_qty")}</th>
                  <th className="hidden lg:table-cell px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">{t("common.status")}</th>
                  <th className="hidden lg:table-cell px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">{t("items.col_unit_profit")}</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_total_profit")}</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("items.col_added")}</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("common.actions")}</th>
                </tr>
                )}
              </thead>
              <tbody>
                {paginated.map((p, idx) => {
                  const supplier    = supplierMap[p.supplier_id ?? ""];
                  const totalProfit = Number(p.profit_money || 0) * Number(p.quantity || 0);
                  const isProfit    = p.profit_status === "profit";
                  const margin      = p.cost_price > 0 ? ((p.selling_price - p.cost_price) / p.cost_price) * 100 : 0;
                  const needsRestock = p.quantity <= lowStock;
                  const isOutOfStock = p.quantity === 0;
                  // Said in words too, not by colour alone.
                  const stockLabel = isOutOfStock ? t("items.out_stock") : needsRestock ? t("items.low_stock") : t("items.in_stock");
                  const restockUrl  = `/purchases?name=${encodeURIComponent(p.name)}&cost=${p.cost_price}&selling=${p.selling_price}&supplierId=${p.supplier_id || ""}`;
                  const rowNum      = (page - 1) * pageSize + idx + 1;

                  return (
                    <tr
                      key={p.id}
                      className={`group border-b border-slate-50 transition-colors last:border-0
                        hover:bg-slate-50/70`}
                    >
                      {/* Row number */}
                      <td className="px-3 py-1.5 text-[11px] text-slate-300 tabular-nums">{rowNum}</td>

                      {/* Product */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          {isCar ? (
                            <button type="button" onClick={() => setGalleryFor(p)} title={t("vehicle.view_photos")}
                              className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-[#0a66c2]/40 transition">
                              {p.thumbnail
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={p.thumbnail} alt={p.name} className="w-full h-full object-cover" />
                                : <Car size={14} className="text-slate-400" />}
                            </button>
                          ) : (
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <Package size={12} className="text-slate-300" />
                          </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-slate-800 text-xs leading-tight">{p.name}</p>
                            </div>
                            {isCar && carIds(parseAttributes(p.attributes)) && (
                              <p className="text-[11px] text-slate-500 max-w-[240px] truncate">{carIds(parseAttributes(p.attributes))}</p>
                            )}
                            {!isCar && p.description && (
                              <p className="text-[11px] text-slate-400 max-w-[160px] truncate">{p.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {isCar ? (() => {
                        const a = parseAttributes(p.attributes);
                        return (<>
                          <td className="px-3 py-1.5 text-xs text-slate-700">{a.car_type ? carTypeLabel(t, a.car_type) : "-"}</td>
                          <td className="px-3 py-1.5 text-center text-xs text-slate-700 tabular-nums">{a.year || "-"}</td>
                          <td className="px-3 py-1.5 text-right text-xs text-slate-600 tabular-nums">{a.battery_range ? `${Number(a.battery_range).toLocaleString()} km` : "-"}</td>
                          <td className="px-3 py-1.5 text-xs text-slate-700">{a.color || "-"}</td>
                          <td className="px-3 py-1.5 text-right">
                            <span className="text-xs font-semibold text-slate-800 tabular-nums">{Number(p.selling_price || 0).toLocaleString()}</span>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums
                              ${isOutOfStock ? "bg-red-100 text-red-700" : needsRestock ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}
                              title={stockLabel} aria-label={`${stockLabel}: ${p.quantity}`}>
                              {(isOutOfStock || needsRestock) && <AlertCircle size={9} className="mr-0.5 shrink-0" aria-hidden />}
                              {p.quantity}
                            </span>
                          </td>
                        </>);
                      })() : (<>
                      {/* Supplier */}
                      <td className="hidden lg:table-cell px-3 py-2.5">
                        {supplier
                          ? <p className="text-xs font-medium text-slate-600 leading-tight">{supplier.name}</p>
                          : <span className="text-slate-300 text-xs">-</span>}
                      </td>

                      {/* Cost price */}
                      <td className="px-3 py-1.5 text-right">
                        <span className="text-xs font-medium text-slate-600 tabular-nums">
                          {Number(p.cost_price || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Selling price */}
                      <td className="px-3 py-1.5 text-right">
                        <span className="text-xs font-semibold text-slate-800 tabular-nums">
                          {Number(p.selling_price || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Margin */}
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-block text-[11px] font-bold px-1.5 py-0.5 rounded tabular-nums
                          ${margin < 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                          {margin >= 0 ? "+" : ""}{margin.toFixed(1)}%
                        </span>
                      </td>

                      {/* Quantity */}
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums
                          ${isOutOfStock  ? "bg-red-100 text-red-700"
                          : needsRestock  ? "bg-amber-100 text-amber-700"
                          :                "bg-slate-100 text-slate-700"}`}
                          title={stockLabel} aria-label={`${stockLabel}: ${p.quantity}`}>
                          {(isOutOfStock || needsRestock) && <AlertCircle size={9} className="mr-0.5 shrink-0" aria-hidden />}
                          {p.quantity}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="hidden lg:table-cell px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold
                          ${isProfit ? "bg-slate-50 text-slate-700 border border-slate-200"
                          :           "bg-red-50 text-red-700 border border-red-200"}`}>
                          {isProfit
                            ? <TrendingUp size={9} strokeWidth={2.5} />
                            : <TrendingDown size={9} strokeWidth={2.5} />}
                          {isProfit ? t("dash.profit_label") : t("common.loss")}
                        </span>
                      </td>

                      {/* Unit profit */}
                      <td className="hidden lg:table-cell px-3 py-2.5 text-right">
                        <span className={`text-xs font-semibold tabular-nums ${isProfit ? "text-slate-800" : "text-red-600"}`}>
                          {isProfit ? "+" : ""}{Number(p.profit_money || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Total profit */}
                      <td className="px-3 py-1.5 text-right">
                        <span className={`text-xs font-bold tabular-nums ${isProfit ? "text-slate-800" : "text-red-600"}`}>
                          {isProfit ? "+" : ""}{totalProfit.toLocaleString()}
                        </span>
                      </td>
                      </>)}

                      {/* Date added */}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {p.created_at ? (
                          <div>
                            <p className="text-[11px] font-medium text-slate-600">
                              {new Date(p.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {new Date(p.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          {isCar ? (
                            <button onClick={() => { setStockInItem(p); setStockInQty(""); }} title={t("items.stock_in")}
                              className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition">
                              <PackagePlus size={11} />
                            </button>
                          ) : needsRestock && (
                            <Link href={restockUrl} title={t("purchases.restock")}
                              className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition">
                              <RefreshCw size={11} />
                            </Link>
                          )}
                          {p.quantity > 0 && (
                            <Link href={`/sales?new=1&product=${p.id}`} title={t("vehicle.sell")}
                              className="p-1 rounded text-[#0a66c2] hover:bg-blue-50 transition">
                              <ShoppingCart size={11} />
                            </Link>
                          )}
                          <button onClick={() => openEditModal(p)} title={t("common.edit")}
                            className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition">
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => deleteProduct(p.id)} disabled={deletingId === p.id} title={t("common.delete")}
                            className="p-1 rounded text-slate-500 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-40">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {paginated.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Package size={28} className="opacity-40" />
              </div>
              <p className="font-semibold text-slate-500 text-sm">{t("items.no_items")}</p>
              <p className="text-xs mt-1.5 text-slate-400">
                {search || filter !== "all" ? t("common.try_adjust_filters") : t("items.add_first")}
              </p>
              {!search && filter === "all" && (
                <button onClick={openCreateModal}
                  className="mt-5 flex items-center gap-1.5 bg-[#0a66c2] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition">
                  <Plus size={14} /> {t("items.add")}
                </button>
              )}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} total={total}
            pageSize={pageSize} pageSizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
        </div>
        )}

        {galleryFor && (
          <CarGallery productId={galleryFor.id} title={galleryFor.name} onClose={() => setGalleryFor(null)} />
        )}

        {/* STOCK IN MODAL */}
        {stockInItem && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-800">{t("items.stock_in")}</h2>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{stockInItem.name}</p>
                </div>
                <button onClick={() => setStockInItem(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.stock_in_qty")} <span className="text-red-400">*</span></label>
                  <input type="number" min="1" step="1" autoFocus className={inputCls} placeholder="1" value={stockInQty}
                    onChange={(e) => setStockInQty(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitStockIn(); }} />
                </div>
                <p className="text-xs text-slate-500">
                  {t("items.stock_in_current")}: <span className="font-semibold tabular-nums">{stockInItem.quantity}</span>
                  {Number(stockInQty) > 0 && <> → <span className="font-bold text-slate-900 tabular-nums">{stockInItem.quantity + Number(stockInQty)}</span></>}
                </p>
              </div>
              <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-slate-100">
                <button onClick={() => setStockInItem(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button>
                <button onClick={submitStockIn} disabled={stockingIn || !(Number(stockInQty) > 0)}
                  className="px-5 py-2 rounded-lg bg-[#0a66c2] text-white text-sm font-semibold hover:bg-[#004182] transition disabled:opacity-60">
                  {stockingIn ? t("common.saving") : t("items.stock_in")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
              <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{modalMode === "edit" ? t("items.edit_title") : t("items.add_title")}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{modalMode === "edit" ? t("common.edit") + " " + t("items.name").toLowerCase() : t("items.add_title")}</p>
                </div>
                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={17} /></button>
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 grid md:grid-cols-2 gap-4 overflow-y-auto flex-1">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.name")} <span className="text-red-400">*</span></label>
                  <input className={inputCls} placeholder={t("items.name_placeholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                {isCar ? (<>
                  {VEHICLE_FIELDS.filter((f) => VEHICLE_ID_FIELDS.includes(f.key)).map(renderCarField)}
                  <p className="md:col-span-2 -mt-2 text-xs text-slate-500">{t("vehicle.unique_hint")}</p>
                  {VEHICLE_FIELDS.filter((f) => !VEHICLE_ID_FIELDS.includes(f.key)).map(renderCarField)}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.selling_price")} <span className="text-red-400">*</span></label>
                    <input type="number" min="0" className={inputCls} placeholder="0" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    {loadingEdit
                      ? <p className="text-xs text-slate-400 flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin" /> {t("vehicle.loading_photos")}</p>
                      : <CarImagesPicker images={form.images} onChange={(images) => setForm((f) => ({ ...f, images }))} />}
                  </div>
                </>) : (<>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.description")}</label>
                  <input className={inputCls} placeholder={t("items.description_placeholder")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.cost_price")} <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.selling_price")} <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} />
                </div>
                {form.cost_price && form.selling_price && (
                  <div className="md:col-span-2 bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
                    {t("items.margin_label")}: <span className={`font-bold ${Number(form.selling_price) >= Number(form.cost_price) ? "text-slate-900" : "text-red-600"}`}>
                      {Number(form.cost_price) > 0 ? (((Number(form.selling_price) - Number(form.cost_price)) / Number(form.cost_price)) * 100).toFixed(1) : 0}%
                    </span>{" · "}{t("items.col_unit_profit")}: <span className="font-bold text-slate-700">{(Number(form.selling_price) - Number(form.cost_price)).toLocaleString()}</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.quantity")} <span className="text-red-400">*</span></label>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("items.supplier")}</label>
                  <select className={inputCls} value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">{t("items.no_supplier")}</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                </>)}
              </div>
              <div className="flex justify-end gap-2.5 px-4 sm:px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">{t("common.cancel")}</button><button onClick={submitForm} disabled={submitting || loadingEdit}
                  className="px-5 py-2 rounded-lg bg-[#0a66c2] text-white text-sm font-semibold hover:bg-[#0a66c2] transition disabled:opacity-60">
                  {submitting ? (modalMode === "edit" ? t("common.saving") : t("common.adding")) : (modalMode === "edit" ? t("common.save") : t("items.add"))}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* IMPORT RESULTS MODAL */}
      {importResults && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{t("items.import_results")}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {importResults.success} {t("items.added_successfully")} · {importResults.failed.length} {t("common.failed")}
                </p>
              </div>
              <button onClick={() => setImportResults(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition">
                <X size={17} />
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">
              {importResults.success > 0 && (
                <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                  <CheckCircle size={16} className="text-green-500 shrink-0" />
                  <p className="text-sm font-semibold text-green-700">
                    {importResults.success} {t("items.import_success")}
                  </p>
                </div>
              )}

              {importResults.failed.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle size={14} className="text-red-500 shrink-0" />
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                      {importResults.failed.length} {t("items.rows_failed")}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {importResults.failed.map((f) => (
                      <div key={`${f.row}-${f.name}`} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <span className="text-[11px] font-bold text-red-400 tabular-nums mt-0.5 shrink-0">{t("common.row")} {f.row}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{f.name}</p>
                          <p className="text-[11px] text-red-500">{f.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResults.success === 0 && importResults.failed.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">{t("items.no_rows_processed")}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 shrink-0">
              {importResults.failed.length > 0 && (
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
                >
                  {t("items.reimport")}
                </button>
              )}
              <button
                onClick={() => setImportResults(null)}
                className="px-4 py-1.5 rounded-lg bg-[#0a66c2] text-white text-xs font-semibold hover:opacity-90 transition"
              >
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemsSkeleton() {
  return (
    <div className="min-h-screen">
      <style>{`@keyframes itm-sh{0%{background-position:-200% 0}100%{background-position:200% 0}}.itm-sh{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:itm-sh 1.4s infinite;border-radius:5px}.itm-sh-w{background:linear-gradient(90deg,rgba(255,255,255,.1) 25%,rgba(255,255,255,.22) 50%,rgba(255,255,255,.1) 75%);background-size:200% 100%;animation:itm-sh 1.4s infinite;border-radius:5px}`}</style>
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4">
        <div className="hgv-surface relative rounded-2xl mb-2 overflow-hidden">
          <div className="relative flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="w-8 h-8 rounded-xl itm-sh-w shrink-0" />
            <div><div className="itm-sh-w h-2 w-14 mb-1 rounded" /><div className="itm-sh-w h-4 w-28 rounded" /></div>
            <div className="hidden md:flex items-center gap-2 ml-auto">
              {[68,68,68].map((_,i)=><div key={i} className="itm-sh-w rounded-xl" style={{width:68,height:44}} />)}
            </div>
            <div className="ml-auto md:ml-0 flex gap-1.5"><div className="itm-sh-w w-7 h-7 rounded-lg" /><div className="itm-sh-w h-7 w-20 rounded-lg" /></div>
          </div>
          <div className="px-4 pb-2 flex gap-1.5"><div className="itm-sh-w h-2 w-4 rounded-full" /><div className="itm-sh-w h-2 w-40 rounded" /></div>
          <div className="px-4 pb-3 flex gap-2"><div className="itm-sh-w flex-1 h-9 rounded-xl" /><div className="itm-sh-w h-9 w-28 rounded-xl" /></div>
        </div>
        <div className="itm-sh h-7 rounded-lg mb-2" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 mb-2">
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} className="bg-white rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="itm-sh h-2 w-14 mb-2 rounded" /><div className="itm-sh h-6 w-10 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div className="itm-sh h-2.5 w-28 rounded" />
            <div className="flex gap-1.5">{[56,52,50,46].map((w,i)=><div key={i} className="itm-sh h-5 rounded" style={{width:w}} />)}</div>
          </div>
          <div className="flex gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
            {[16,100,70,55,65,50,44,64,72,72,64,44].map((w,i)=><div key={i} className="itm-sh h-2 rounded" style={{width:w}} />)}
          </div>
          {Array.from({length:8}).map((_,i)=>(
            <div key={i} className="flex items-center gap-2 px-3 border-b border-slate-50" style={{padding:"6px 12px"}}>
              <div className="itm-sh h-2 w-4 rounded" />
              <div className="flex items-center gap-2 w-28 shrink-0">
                <div className="itm-sh w-8 h-8 rounded-lg shrink-0" />
                <div><div className="itm-sh h-2.5 w-16 rounded mb-1" /><div className="itm-sh h-2 w-10 rounded" /></div>
              </div>
              {[52,40,44,48,40,52,60,52,52,50,48].map((w,j)=><div key={j} className="itm-sh h-2.5 rounded shrink-0" style={{width:w}} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
