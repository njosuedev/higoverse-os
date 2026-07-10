"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  listOrdersAdmin, getOrdersSummary, updateOrderStatus,
  type Order, type OrderStatus,
} from "@/lib/order-api";
import { formatRwf } from "@/lib/format";
import {
  ClipboardList, Package, Loader2, MapPin, Phone, Search, RefreshCw,
  CheckCircle, Truck, XCircle, Clock, X, AlertTriangle, PackageCheck,
} from "lucide-react";

const LI_BLUE = "#1372e6";
const POLL_INTERVAL = 30;
const LIMIT = 20;

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_TINT: Record<OrderStatus, { bg: string; text: string; dot: string }> = {
  pending:           { bg: "#fff7e6", text: "#fa8c16", dot: "#fa8c16" },
  confirmed:         { bg: "#EBF2FD", text: LI_BLUE,   dot: LI_BLUE  },
  out_for_delivery:  { bg: "#f4ecfe", text: "#7c3aed", dot: "#7c3aed" },
  delivered:         { bg: "#eafaf1", text: "#057642", dot: "#057642" },
  cancelled:         { bg: "#fdecea", text: "#d93025", dot: "#d93025" },
};

// Mirrors the order-service's legal forward transitions.
const NEXT_ACTIONS: Record<OrderStatus, { to: OrderStatus; label: string; icon: typeof CheckCircle; color: string }[]> = {
  pending:          [{ to: "confirmed", label: "Confirm", icon: CheckCircle, color: "#057642" }],
  confirmed:        [{ to: "out_for_delivery", label: "Out for delivery", icon: Truck, color: LI_BLUE }],
  out_for_delivery: [{ to: "delivered", label: "Mark delivered", icon: PackageCheck, color: "#057642" }],
  delivered:        [],
  cancelled:        [],
};

const STATUS_TABS: { key: OrderStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

function timeAgo(iso: string) {
  const s = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
  const secs = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (secs < 5) return "Just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

interface CancelModalState {
  orderId: string;
  productName: string;
}

export default function OrdersAdminPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [search, setSearch]             = useState("");
  const [page, setPage]                 = useState(1);

  const [orders, setOrders]         = useState<Order[]>([]);
  const [total, setTotal]           = useState(0);
  const [summary, setSummary]       = useState<Record<OrderStatus, number> | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId]     = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<CancelModalState | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [countdown, setCountdown]   = useState(POLL_INTERVAL);
  const countdownRef                = useRef(POLL_INTERVAL);

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "admin") router.replace("/");
  }, [ready, user, router]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [list, sum] = await Promise.all([
        listOrdersAdmin({
          page, limit: LIMIT,
          status: statusFilter === "all" ? "" : statusFilter,
          search: search.trim() || undefined,
        }),
        getOrdersSummary(),
      ]);
      setOrders(list.items);
      setTotal(list.total);
      setSummary(sum);
      countdownRef.current = POLL_INTERVAL;
      setCountdown(POLL_INTERVAL);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { if (user?.role === "admin") load(); }, [user, load]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const t = setInterval(() => {
      countdownRef.current -= 1;
      if (countdownRef.current <= 0) load(true);
      else setCountdown(countdownRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, [user, load]);

  const handleAdvance = async (order: Order, to: OrderStatus) => {
    setActionId(order.id);
    setError(null);
    try {
      const updated = await updateOrderStatus(order.id, to);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
      const sum = await getOrdersSummary();
      setSummary(sum);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update order");
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelModal) return;
    setActionId(cancelModal.orderId);
    setError(null);
    try {
      const updated = await updateOrderStatus(cancelModal.orderId, "cancelled", cancelReason.trim() || undefined);
      setOrders((prev) => prev.map((o) => (o.id === cancelModal.orderId ? updated : o)));
      const sum = await getOrdersSummary();
      setSummary(sum);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to cancel order");
    } finally {
      setActionId(null);
      setCancelModal(null);
      setCancelReason("");
    }
  };

  if (!ready || !user || user.role !== "admin") return null;

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="min-h-screen" style={{ background: "#F3F2EE" }}>
      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-3 sm:py-4 space-y-4">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#EBF2FD" }}>
              <ClipboardList size={18} style={{ color: LI_BLUE }} />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 text-base leading-tight">Order Fulfillment</h1>
              <p className="text-xs text-gray-400">{total} order{total !== 1 ? "s" : ""} total</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {refreshing ? "Updating…" : `Refreshes in ${countdown}s`}
            </div>
            <button onClick={() => load(true)} disabled={loading || refreshing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 font-medium">
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-white border border-red-200 rounded-xl px-4 py-3 shadow-sm">
            <AlertTriangle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-500">✕</button>
          </div>
        )}

        {/* ── KPI tiles ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(["pending", "confirmed", "out_for_delivery", "delivered", "cancelled"] as OrderStatus[]).map((s) => {
            const tint = STATUS_TINT[s];
            const active = statusFilter === s;
            return (
              <button key={s} onClick={() => { setStatusFilter(active ? "all" : s); setPage(1); }}
                className="bg-white rounded-xl shadow-sm border p-4 text-left transition"
                style={{ borderColor: active ? tint.text : "#e5e7eb" }}>
                <p className="text-xs text-gray-400 font-medium">{STATUS_LABEL[s]}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: tint.text }}>
                  {summary ? summary[s] : <Loader2 size={16} className="animate-spin" />}
                </p>
              </button>
            );
          })}
        </div>

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-1 rounded-lg overflow-hidden border border-gray-200 flex-wrap">
              {STATUS_TABS.map((t) => (
                <button key={t.key} onClick={() => { setStatusFilter(t.key); setPage(1); }}
                  className="px-2.5 py-1.5 text-xs font-medium transition border-r last:border-r-0 border-gray-200"
                  style={statusFilter === t.key ? { background: LI_BLUE, color: "#fff" } : { background: "#fff", color: "#666" }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative sm:ml-auto">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search customer, phone, product…"
                className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 w-full sm:w-56"
              />
            </div>
          </div>

          {/* ── List ──────────────────────────────────────────────────────── */}
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg animate-pulse" style={{ background: "#F3F2EE" }} />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center">
              <Package size={36} className="text-gray-200 mx-auto mb-3" />
              <p className="font-semibold text-gray-600 text-sm">No orders found</p>
              <p className="text-gray-400 text-xs mt-1">Orders placed by customers will show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {orders.map((o) => {
                const tint = STATUS_TINT[o.status];
                const busy = actionId === o.id;
                const actions = NEXT_ACTIONS[o.status];
                const canCancel = o.status !== "delivered" && o.status !== "cancelled";
                return (
                  <div key={o.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
                    {/* Product */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {o.product_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.product_image} alt={o.product_name ?? ""} className="h-12 w-12 shrink-0 rounded-lg border border-gray-100 object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-300">
                          <Package size={18} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{o.product_name ?? "Product"}</p>
                        <p className="text-[11px] text-gray-400">Qty {o.quantity} · {formatRwf(o.total_amount)} · {o.payment_method}</p>
                        <p className="text-[10px] text-gray-300 mt-0.5">{timeAgo(o.created_at)}</p>
                      </div>
                    </div>

                    {/* Customer */}
                    <div className="min-w-0 sm:w-52 shrink-0">
                      <p className="truncate text-xs font-semibold text-gray-700">{o.customer_name ?? o.customer_email ?? "Customer"}</p>
                      <p className="flex items-center gap-1 text-[11px] text-gray-400">
                        <Phone size={10} className="shrink-0" /> {o.delivery_phone}
                      </p>
                      <p className="flex items-center gap-1 truncate text-[11px] text-gray-400">
                        <MapPin size={10} className="shrink-0" /> {o.delivery_address_text}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="shrink-0">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: tint.bg, color: tint.text }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tint.dot }} />
                        {STATUS_LABEL[o.status]}
                      </span>
                      {o.status === "cancelled" && o.cancel_reason && (
                        <p className="mt-1 max-w-[160px] truncate text-[10px] text-gray-400" title={o.cancel_reason}>{o.cancel_reason}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {actions.map((a) => {
                        const Icon = a.icon;
                        return (
                          <button key={a.to} onClick={() => handleAdvance(o, a.to)} disabled={busy}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full text-white font-semibold transition disabled:opacity-40 hover:opacity-90"
                            style={{ background: a.color }}>
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
                            {a.label}
                          </button>
                        );
                      })}
                      {canCancel && (
                        <button onClick={() => { setCancelReason(""); setCancelModal({ orderId: o.id, productName: o.product_name ?? "this order" }); }}
                          disabled={busy}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
                          title="Cancel order">
                          <XCircle size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Pagination ────────────────────────────────────────────────── */}
          {!loading && total > LIMIT && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 font-medium">
                  Previous
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 font-medium">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Cancel modal ──────────────────────────────────────────────────── */}
      {cancelModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <Clock size={14} className="text-red-500" /> Cancel Order
              </h3>
              <button onClick={() => setCancelModal(null)} className="text-gray-300 hover:text-gray-500">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Cancelling <span className="font-semibold text-gray-700">{cancelModal.productName}</span> restores the reserved stock. This can&apos;t be undone.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (optional)…"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-100 resize-none"
            />
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => setCancelModal(null)}
                className="flex-1 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                Keep order
              </button>
              <button onClick={handleCancel} disabled={actionId === cancelModal.orderId}
                className="flex-1 text-sm font-bold px-3 py-2 rounded-lg text-white transition disabled:opacity-50"
                style={{ background: "#d93025" }}>
                {actionId === cancelModal.orderId ? "Cancelling…" : "Cancel order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
