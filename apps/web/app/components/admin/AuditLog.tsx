"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  History, KeyRound, Pencil, Plus, RefreshCw, Search, ShieldCheck, Store, ToggleLeft, ToggleRight, Trash2, UserCog, Users,
} from "lucide-react";
import { getAdminAudit, type AuditEntry } from "@/lib/admin-api";
import { fullDate } from "./insight-ui";

const ICONS: Record<string, typeof History> = {
  "shop.create": Plus, "shop.edit": Pencil, "shop.enable": ToggleRight, "shop.disable": ToggleLeft,
  "shop.verify_email": ShieldCheck, "shop.delete": Trash2,
  "user.create": Plus, "user.edit": Pencil, "user.enable": ToggleRight, "user.disable": ToggleLeft,
  "user.role": UserCog, "user.password": KeyRound, "user.delete": Trash2,
};

/** One line of the log in words, e.g. "Changed the role of a@b.rw: Cashier → Manager". */
export function actionLabel(e: AuditEntry, t: (k: string) => string): string {
  const key = `audit.${e.action}`;
  let s = t(key);
  if (s === key) s = e.action;
  s = s.replace("{target}", e.target_label ?? "-");
  const d = e.detail ?? {};
  if (e.action === "user.role" && typeof d.from === "string" && typeof d.to === "string") {
    s += `: ${t(`role.${d.from}`)} → ${t(`role.${d.to}`)}`;
  } else if (e.action === "shop.edit" && Array.isArray(d.fields)) {
    s += ` (${(d.fields as string[]).map((f) => t(`audit.field_${f}`).startsWith("audit.") ? f : t(`audit.field_${f}`)).join(", ")})`;
  } else if (e.action === "user.create" && typeof d.role === "string") {
    s += ` · ${t(`role.${d.role}`)}${typeof d.shop === "string" ? ` · ${d.shop}` : ""}`;
  }
  return s;
}

/** Everything the platform admins did, newest first. */
export default function AuditLog({ t, lang }: { t: (k: string) => string; lang: string }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "shop" | "user">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try { setRows(await getAdminAudit({ limit: 500 })); }
    catch (e) { setError(e instanceof Error ? e.message : t("admin.err_load")); }
    finally { setBusy(false); }
  }, [t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once when the tab opens
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (rows ?? [])
    .filter((r) => kind === "all" || r.target_type === kind)
    .filter((r) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return (r.target_label ?? "").toLowerCase().includes(s) || (r.admin_email ?? "").toLowerCase().includes(s) || r.action.includes(s);
    }), [rows, kind, q]);

  // Grouped by day, as people scan a log.
  const days = useMemo(() => {
    const out: { day: string; items: AuditEntry[] }[] = [];
    for (const r of shown) {
      const day = r.at ? new Date(r.at).toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "-";
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push(r);
    }
    return out;
  }, [shown, lang]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-gray-100 bg-slate-50/60 px-4 py-2.5 sm:flex-row sm:items-center">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800"><History size={14} className="text-ink" /> {t("admin.tab_activity")}</h2>
        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs sm:ml-3">
          {([["all", t("common.all"), History], ["shop", t("admin.tab_shops"), Store], ["user", t("admin.tab_users"), Users]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
              className={`flex items-center gap-1 border-r border-gray-200 px-2.5 py-1.5 font-medium last:border-r-0 ${kind === k ? "bg-ink text-white" : "bg-white text-gray-600"}`}>
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.search_log")}
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-7 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-48" />
        </div>
        <button onClick={load} disabled={busy} aria-label={t("common.refresh")}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
      {rows === null && !error ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="hgv-shimmer h-10 rounded-lg" />)}</div>
      ) : days.length === 0 ? (
        <div className="py-16 text-center">
          <History size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-gray-400">{t("admin.log_empty")}</p>
          <p className="mt-1 text-xs text-gray-400">{t("admin.log_empty_hint")}</p>
        </div>
      ) : (
        <div>
          {days.map((d) => (
            <section key={d.day}>
              <h3 className="sticky top-0 border-b border-gray-100 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{d.day}</h3>
              <ul className="divide-y divide-gray-50">
                {d.items.map((r) => {
                  const Icon = ICONS[r.action] ?? History;
                  const danger = r.action.endsWith(".delete") || r.action.endsWith(".disable");
                  return (
                    <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${danger ? "bg-accent-soft text-accent-dark" : "bg-ink-soft text-ink"}`}>
                        <Icon size={13} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-gray-800">{actionLabel(r, t)}</span>
                        <span className="block text-[11px] text-gray-400">{r.admin_email ?? "-"} · {fullDate(r.at, lang)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
