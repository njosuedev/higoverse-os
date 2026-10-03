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
      <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-white px-3 py-2 focus-within:border-ink">
        <Calendar size={15} className="shrink-0 text-text-faint" />
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)}
          className="hgv-figure w-32 cursor-pointer bg-transparent text-sm text-text focus:outline-none" />
        <span className="text-sm text-text-faint">→</span>
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)}
          className="hgv-figure w-32 cursor-pointer bg-transparent text-sm text-text focus:outline-none" />
      </div>

      {(["today", "week", "month", "year"] as Preset[]).map((p) => {
        const range = applyPreset(p);
        const on = range.from === from && range.to === to;
        return (
          <button
            key={p}
            onClick={() => preset(p)}
            aria-pressed={on}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ${
              on ? "border-ink bg-ink-soft text-ink" : "border-border-strong bg-white text-text-muted hover:border-ink hover:text-text"
            }`}
          >
            {p === "today" ? t("daterange.today") : p === "week" ? t("daterange.week") : p === "month" ? t("daterange.month") : t("daterange.year")}
          </button>
        );
      })}

      {hasFilter && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-paper-dim hover:text-text"
        >
          <X size={14} /> {t("daterange.clear")}
        </button>
      )}
    </div>
  );
}
