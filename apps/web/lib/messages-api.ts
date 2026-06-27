import { getToken, handleUnauthorized } from "@/lib/auth";

export const MSG_API = (
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
  is_deleted:      boolean;
  edited_at:       string | null;
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

/**
 * Fire-and-forget ping that wakes the Render.com free-tier service.
 * Call this on marketplace page mount so the service is warm by the time
 * the user opens the order modal. Swallows all errors silently.
 */
export function warmupMsgService(): void {
  fetch(`${MSG_API}/health`, { method: "GET", mode: "no-cors" }).catch(() => {});
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await msgRequest("/api/v1/conversations");
  return res?.data ?? [];
}

export async function createOrGetConversation(
  payload: CreateConversationPayload,
): Promise<Conversation> {
  // Retry up to 4 times with backoff — handles Render.com cold-start (30-90 s wake time).
  // Network errors ("Failed to fetch") trigger retry; HTTP errors (4xx/5xx) do not.
  const MAX = 4;
  const DELAYS = [2000, 5000, 10000, 15000]; // ms between attempts
  let lastErr: unknown;
  for (let i = 0; i < MAX; i++) {
    try {
      const res = await msgRequest("/api/v1/conversations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return res?.data;
    } catch (err) {
      lastErr = err;
      // Only retry on network errors, not on HTTP errors like 401/4xx
      const isNetErr = err instanceof TypeError || (err instanceof Error && err.message.startsWith("Failed to fetch"));
      if (!isNetErr || i === MAX - 1) break;
      await new Promise((r) => setTimeout(r, DELAYS[i]));
    }
  }
  throw lastErr;
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

export async function editMessage(convId: string, msgId: string, content: string): Promise<Message> {
  const res = await msgRequest(`/api/v1/conversations/${convId}/messages/${msgId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
  return res?.data;
}

export async function deleteMessage(convId: string, msgId: string): Promise<Message> {
  const res = await msgRequest(`/api/v1/conversations/${convId}/messages/${msgId}`, {
    method: "DELETE",
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

/**
 * Open an SSE stream to receive real-time message events.
 * Returns an AbortController — call ctrl.abort() to close the connection.
 *
 * onEvent is called for each parsed event payload.
 * onFallback is called when SSE is unavailable (network error, server restart)
 * so the caller can switch to polling.
 */
export function openMessageStream(
  onEvent: (evt: { type: string; conversation_id?: string; message?: Message }) => void,
  onFallback: () => void,
): AbortController {
  const ctrl = new AbortController();
  const token = getToken();
  if (!token) { onFallback(); return ctrl; }

  (async () => {
    try {
      const resp = await fetch(`${MSG_API}/api/v1/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) { onFallback(); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE messages are separated by double newlines
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine.slice(6));
            onEvent(evt);
          } catch { /* malformed JSON — skip */ }
        }
      }
      // Stream ended cleanly (server restart) — fall back to polling
      if (!ctrl.signal.aborted) onFallback();
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") onFallback();
    }
  })();

  return ctrl;
}
