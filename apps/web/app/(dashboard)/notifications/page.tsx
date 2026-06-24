"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  MessageSquare,
  Tag,
  Check,
  X,
  Store,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  Notification,
} from "@/lib/notifications-api";
import { formatDistanceToNow } from "date-fns";

const BRAND = "#ff6a00";

const NOTIF_ICON: Record<string, React.ReactNode> = {
  new_message:    <MessageSquare size={16} />,
  offer_received: <Tag size={16} />,
  offer_accepted: <Check size={16} />,
  offer_rejected: <X size={16} />,
  shop_approved:  <Store size={16} />,
  shop_rejected:  <X size={16} />,
  system:         <Bell size={16} />,
};

const NOTIF_COLORS: Record<string, string> = {
  new_message:    "bg-blue-100 text-blue-600",
  offer_received: "bg-orange-100 text-orange-600",
  offer_accepted: "bg-green-100 text-green-700",
  offer_rejected: "bg-red-100 text-red-600",
  shop_approved:  "bg-green-100 text-green-700",
  shop_rejected:  "bg-red-100 text-red-600",
  system:         "bg-gray-100 text-gray-600",
};

function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifs, setNotifs]   = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listNotifications(100);
      setNotifs(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const handleRead = async (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await markNotificationRead(id).catch(() => {});
  };

  const handleDelete = async (id: string) => {
    setNotifs((prev) => prev.filter((n) => n.id !== id));
    await deleteNotification(id).catch(() => {});
  };

  const handleReadAll = async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await markAllNotificationsRead().catch(() => {});
  };

  const handleDeleteAll = async () => {
    if (!confirm("Delete all notifications?")) return;
    setNotifs([]);
    await deleteAllNotifications().catch(() => {});
  };

  const handleClick = (n: Notification) => {
    handleRead(n.id);
    const convId = n.data?.conversation_id as string | undefined;
    if (convId) {
      router.push("/messages");
    }
  };

  const unread = notifs.filter((n) => !n.is_read).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <Bell size={20} style={{ color: BRAND }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Notifications</h1>
            {unread > 0 && (
              <p className="text-xs text-orange-500 font-semibold">{unread} unread</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
          {unread > 0 && (
            <button
              onClick={handleReadAll}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition"
            >
              Mark all read
            </button>
          )}
          {notifs.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 transition"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-sm text-red-600 border border-red-100">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-orange-400" />
        </div>
      ) : notifs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <Bell size={28} className="text-gray-300" />
          </div>
          <p className="text-base font-bold text-gray-600 mb-1">All caught up!</p>
          <p className="text-sm text-gray-400">
            Notifications about messages, offers, and shop updates will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifs.map((n) => {
            const icon   = NOTIF_ICON[n.type] ?? <Bell size={16} />;
            const colors = NOTIF_COLORS[n.type] ?? "bg-gray-100 text-gray-600";
            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`relative flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition group ${
                  n.is_read
                    ? "bg-white border-gray-100 hover:border-gray-200"
                    : "bg-orange-50 border-orange-200 hover:border-orange-300"
                }`}
              >
                {/* Unread dot */}
                {!n.is_read && (
                  <span
                    className="absolute top-4 right-12 w-2 h-2 rounded-full"
                    style={{ background: BRAND }}
                  />
                )}

                {/* Icon */}
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors}`}
                >
                  {icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold leading-snug ${n.is_read ? "text-gray-700" : "text-gray-900"}`}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1.5">{timeAgo(n.created_at)}</p>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 shrink-0"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
