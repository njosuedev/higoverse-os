"use client";

import React from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
}

export default function StatCard({
  title,
  value,
  icon,
  subtitle,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-lg transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {title}
          </p>

          <h3 className="text-2xl font-bold text-slate-900 mt-1">
            {value}
          </h3>

          {subtitle && (
            <p className="text-xs text-slate-400 mt-2">
              {subtitle}
            </p>
          )}
        </div>

        <div className="w-12 h-12 rounded-xl bg-blue-50 text-green-600 flex items-center justify-center">
          {icon}
        </div>
      </div>
    </div>
  );
}
