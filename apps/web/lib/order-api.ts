import { getToken } from "@/lib/auth";

const ORDER_API = process.env.NEXT_PUBLIC_API_ORDERS || "https://higoverse-orders.vercel.app";

export async function orderRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${ORDER_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    return null; // Not signed in / token rejected
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Order API error: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export type OrderStatus = "pending" | "confirmed" | "out_for_delivery" | "delivered" | "cancelled";

export interface Order {
  id: string;
  customer_id: string;
  customer_name: string | null;
  customer_email: string | null;
  delivery_phone: string;
  shop_id: string;
  product_id: string;
  product_name: string | null;
  product_image: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  delivery_address_text: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_notes: string | null;
  payment_method: string;
  status: OrderStatus;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderListResult {
  items: Order[];
  total: number;
  page: number;
  limit: number;
}

export interface OrderListParams {
  page?: number;
  limit?: number;
  status?: OrderStatus | "";
  from_date?: string;
  to_date?: string;
  search?: string;
}

export async function listOrdersAdmin(params: OrderListParams = {}): Promise<OrderListResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") qs.set(k, String(v)); });
  const res = await orderRequest(`/orders/?${qs.toString()}`);
  return res?.data ?? { items: [], total: 0, page: 1, limit: 25 };
}

export async function getOrdersSummary(): Promise<Record<OrderStatus, number>> {
  const res = await orderRequest("/orders/summary");
  return res?.data ?? { pending: 0, confirmed: 0, out_for_delivery: 0, delivered: 0, cancelled: 0 };
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, cancelReason?: string): Promise<Order> {
  const res = await orderRequest(`/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, cancel_reason: cancelReason }),
  });
  return res?.data;
}
