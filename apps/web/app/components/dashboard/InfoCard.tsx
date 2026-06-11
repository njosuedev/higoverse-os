"use client";

import React from "react";

interface InfoCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

export default function InfoCard({
  icon,
  label,
  value,
}: InfoCardProps) {
  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 hover:border-blue-200 transition-all">
      <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
        {icon}
        <span>{label}</span>
      </div>

      <p className="mt-2 font-semibold text-slate-900 break-all">
        {value}
      </p>
    </div>
  );
}
