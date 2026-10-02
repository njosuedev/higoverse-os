"use client";

import { Calendar, X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

interface Props {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onClear: () => void;
  accentClass?: string;
}

type Preset = "today" | "week" | "month" | "year";

function applyPreset(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const to = ymd(now);
  const d = new Date(now);
  if (preset === "today") return { from: to, to };
  if (preset === "week") { d.setDate(d.getDate() - 6); return { from: ymd(d), to }; }
  if (preset === "month") { return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to }; }
  return { from: `${now.getFullYear()}-01-01`, to };
}

export default function DateRangeFilter({ from, to, onFrom, onTo, onClear }: Props) {
  const { t } = useLanguage();
  const hasFilter = from || to;

  function preset(p: Preset) {
    const { from: f, to: t } = applyPreset(p);
    onFrom(f);
    onTo(t);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 bg-white border border-border rounded-press px-2.5 py-1.5">
        <Calendar size={13} className="text-text-faint shrink-0" />
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)}
          className="hgv-figure bg-transparent text-text text-xs focus:outline-none w-28 cursor-pointer" />
        <span className="text-text-faint text-xs">→</span>
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)}
          className="hgv-figure bg-transparent text-text text-xs focus:outline-none w-28 cursor-pointer" />
      </div>

      {(["today", "week", "month", "year"] as Preset[]).map((p) => (
        <button
          key={p}
          onClick={() => preset(p)}
          className="text-xs px-2.5 py-1.5 rounded-press border border-border bg-white text-text-muted hover:bg-paper-dim hover:text-text transition-colors duration-200"
        >
          {p === "today" ? t("daterange.today") : p === "week" ? t("daterange.week") : p === "month" ? t("daterange.month") : t("daterange.year")}
        </button>
      ))}

      {hasFilter && (
        <button onClick={onClear} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-press bg-accent-soft text-accent-dark hover:bg-[#efd6cb] transition-colors duration-200">
          <X size={11} /> {t("daterange.clear")}
        </button>
      )}
    </div>
  );
}
