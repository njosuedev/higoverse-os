"use client";

import { Calendar, X } from "lucide-react";

interface Props {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onClear: () => void;
  accentClass?: string; // e.g. "focus:ring-orange-500/30 focus:border-orange-400"
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

export default function DateRangeFilter({ from, to, onFrom, onTo, onClear, accentClass = "focus:ring-slate-500/30 focus:border-slate-400" }: Props) {
  const hasFilter = from || to;
  const inputCls = `bg-white/10 border border-white/20 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none ${accentClass} placeholder:text-white/40`;

  function preset(p: Preset) {
    const { from: f, to: t } = applyPreset(p);
    onFrom(f);
    onTo(t);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2.5">
      <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1.5">
        <Calendar size={13} className="text-white/60 shrink-0" />
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)}
          className="bg-transparent text-white text-xs focus:outline-none w-28 cursor-pointer" />
        <span className="text-white/40 text-xs">→</span>
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)}
          className="bg-transparent text-white text-xs focus:outline-none w-28 cursor-pointer" />
      </div>

      {(["today", "week", "month", "year"] as Preset[]).map((p) => (
        <button
          key={p}
          onClick={() => preset(p)}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 transition capitalize"
        >
          {p === "today" ? "Today" : p === "week" ? "7 days" : p === "month" ? "This month" : "This year"}
        </button>
      ))}

      {hasFilter && (
        <button onClick={onClear} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition">
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}
