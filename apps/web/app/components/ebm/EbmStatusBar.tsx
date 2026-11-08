"use client";

// Sales → the RRA EBM bar: whether RRA's VSDC can sign right now (checked
// every minute, CIS spec §7.9), the business's TIN / SDC ID / MRC, how many
// sales still wait for RRA's signature (with "Send all to RRA"), and the
// RRA reports.

import { useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, FileBarChart, Landmark, Loader2, Send } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { notify } from "@/lib/dialogs";
import { ebmApi, type EbmConfig, type EbmVsdcStatus } from "@/lib/ebm-api";

export default function EbmStatusBar({ cfg, refreshKey, onReports, onSigned }: {
  cfg: EbmConfig;
  /** Changes when sales change, so the unsigned count follows. */
  refreshKey: unknown;
  onReports: () => void;
  onSigned: () => void;
}) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<EbmVsdcStatus | null>(null);
  const [unsigned, setUnsigned] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => ebmApi.status().then((r) => { if (alive) setStatus(r.data); })
      .catch(() => { if (alive) setStatus({ ok: false, reason: null }); });
    check();
    const id = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let alive = true;
    ebmApi.unsigned().then((r) => { if (alive) setUnsigned(r.data.count); }).catch(() => {});
    return () => { alive = false; };
  }, [refreshKey]);

  async function sendAll() {
    setSending(true);
    try {
      const r = await ebmApi.signPending();
      setUnsigned(r.data.left);
      notify(r.data.failed
        ? `${t("ebmbar.sent_some").replace("{n}", String(r.data.signed)).replace("{f}", String(r.data.failed))}\n${r.data.errors.join("\n")}`
        : t("ebmbar.sent_all").replace("{n}", String(r.data.signed)), r.data.failed ? "warning" : "success");
      onSigned();
    } catch (e) { notify(e instanceof Error ? e.message : t("common.error")); }
    finally { setSending(false); }
  }

  const down = status && !status.ok;
  return (
    <div className={`mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2 text-xs ${down ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
      <span className={`flex items-center gap-1.5 font-semibold ${down ? "text-red-700" : status ? "text-green-700" : "text-slate-500"}`}>
        {!status ? <Loader2 size={13} className="animate-spin" /> : down ? <AlertTriangle size={14} /> : <BadgeCheck size={14} />}
        <Landmark size={13} className="text-slate-400" />
        {!status ? t("ebmbar.checking") : down ? t("ebmbar.down") : t("ebmbar.ok")}
      </span>
      {down && status?.reason && <span className="text-red-700/80">{status.reason}</span>}
      <span className="text-slate-500">TIN {cfg.tin} · SDC {cfg.sdc_id || "—"} · MRC {cfg.mrc_no || "—"}</span>
      <span className="ml-auto flex flex-wrap items-center gap-1.5">
        {unsigned > 0 && (
          <>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
              {t("ebmbar.unsigned").replace("{n}", String(unsigned))}
            </span>
            <button onClick={() => void sendAll()} disabled={sending || !!down}
              className="flex items-center gap-1 rounded-lg bg-[#0a66c2] px-2.5 py-1 font-semibold text-white hover:bg-[#004182] disabled:opacity-50">
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {t("ebmbar.send_all")}
            </button>
          </>
        )}
        <button onClick={onReports}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50">
          <FileBarChart size={12} /> {t("ebmr.button")}
        </button>
      </span>
    </div>
  );
}
