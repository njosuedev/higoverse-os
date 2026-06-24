import { getToken, handleUnauthorized } from "@/lib/auth";

const NOTIF_API =
  process.env.NEXT_PUBLIC_NOTIFICATION_API ||
  "https://higoverse-notifications.vercel.app";

async function notifRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${NOTIF_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Notification API error: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Notification {
  id:         string;
  user_id:    string;
  type:       string;
  title:      string;
  body:       string | null;
  data:       Record<string, unknown>;
  is_read:    boolean;
  created_at: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function listNotifications(limit = 50): Promise<Notification[]> {
  const res = await notifRequest(`/api/v1/notifications?limit=${limit}`);
  return res?.data ?? [];
}

export async function getUnreadNotifCount(): Promise<number> {
  const res = await notifRequest("/api/v1/notifications/unread-count");
  return res?.data?.count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await notifRequest(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await notifRequest("/api/v1/notifications/read-all", { method: "PATCH" });
}

export async function deleteNotification(id: string): Promise<void> {
  await notifRequest(`/api/v1/notifications/${id}`, { method: "DELETE" });
}

export async function deleteAllNotifications(): Promise<void> {
  await notifRequest("/api/v1/notifications", { method: "DELETE" });
}
