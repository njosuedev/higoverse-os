import { getToken, handleUnauthorized } from "@/lib/auth";

const MSG_API = (
  process.env.NEXT_PUBLIC_MESSAGE_API || "https://higoverse-messages.onrender.com"
).replace(/\/$/, "");

async function msgRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${MSG_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Message API error: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Conversation {
  id:              string;
  customer_id:     string;
  customer_name:   string | null;
  shop_id:         string;
  shop_name:       string | null;
  product_id:      string | null;
  product_name:    string | null;
  product_image:   string | null;
  listed_price:    number | null;
  agreed_price:    number | null;
  status:          "open" | "accepted" | "rejected" | "closed";
  unread_count:    number;
  last_message_at: string | null;
  created_at:      string;
}

export interface Message {
  id:              string;
  conversation_id: string;
  sender_id:       string;
  sender_name:     string | null;
  sender_type:     "customer" | "shop";
  content:         string;
  message_type:    "text" | "offer" | "offer_accepted" | "offer_rejected" | "system";
  offer_price:     number | null;
  is_read:         boolean;
  created_at:      string;
}

export interface CreateConversationPayload {
  shop_id:       string;
  shop_name?:    string;
  customer_name?: string;
  product_id?:   string;
  product_name?: string;
  product_image?: string;
  listed_price?: number;
  first_message?: string;
}

export interface SendMessagePayload {
  content:      string;
  message_type?: "text" | "offer";
  offer_price?: number;
  sender_name?: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function listConversations(): Promise<Conversation[]> {
  const res = await msgRequest("/api/v1/conversations");
  return res?.data ?? [];
}

export async function createOrGetConversation(
  payload: CreateConversationPayload,
): Promise<Conversation> {
  const res = await msgRequest("/api/v1/conversations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res?.data;
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await msgRequest(`/api/v1/conversations/${id}`);
  return res?.data;
}

export async function listMessages(convId: string, after?: string): Promise<Message[]> {
  const q = after ? `?after=${encodeURIComponent(after)}` : "";
  const res = await msgRequest(`/api/v1/conversations/${convId}/messages${q}`);
  return res?.data ?? [];
}

export async function sendMessage(
  convId: string,
  payload: SendMessagePayload,
): Promise<Message> {
  const res = await msgRequest(`/api/v1/conversations/${convId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res?.data;
}

export async function respondToOffer(
  convId: string,
  msgId: string,
  action: "accept" | "reject",
): Promise<Message> {
  const res = await msgRequest(`/api/v1/conversations/${convId}/offers/${msgId}`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  return res?.data;
}

export async function closeConversation(convId: string): Promise<void> {
  await msgRequest(`/api/v1/conversations/${convId}`, { method: "DELETE" });
}

export async function getUnreadCount(): Promise<number> {
  const res = await msgRequest("/api/v1/unread-count");
  return res?.data?.count ?? 0;
}
