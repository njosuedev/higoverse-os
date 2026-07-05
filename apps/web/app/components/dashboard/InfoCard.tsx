"use client";

import React from "react";

type Tone = "blue" | "orange" | "slate";

interface InfoCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: Tone;
}

const TONE_MAP: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-600",
  orange: "bg-orange-50 text-orange-600",
  slate: "bg-slate-100 text-slate-600",
};

export default function InfoCard({ icon, label, value, tone = "blue" }: InfoCardProps) {
  return (
    <div className="hgv-card-hover rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_MAP[tone]}`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-slate-500">{label}</span>
      </div>
      <p className="mt-2.5 break-all font-semibold text-slate-900">{value}</p>
    </div>
  );
}
