"use client";

import { Car, Store } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { BUSINESS_LAYOUTS, type BusinessLayout } from "@/lib/business-layout";

const ICONS: Record<BusinessLayout, typeof Store> = { retail: Store, car: Car };

/** Admin-only choice of which UI template a business gets. */
export default function LayoutPicker({
  value,
  onChange,
}: {
  value: BusinessLayout;
  onChange: (l: BusinessLayout) => void;
}) {
  const { t } = useLanguage();
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1">{t("admin.layout")}</label>
      <div role="radiogroup" aria-label={t("admin.layout")} className="grid grid-cols-2 gap-2">
        {BUSINESS_LAYOUTS.map((l) => {
          const Icon = ICONS[l];
          const active = value === l;
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(l)}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                active ? "border-ink bg-ink-soft" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <Icon size={14} className={`mt-0.5 shrink-0 ${active ? "text-ink" : "text-gray-400"}`} />
              <span className="min-w-0">
                <span className={`block text-xs font-semibold ${active ? "text-ink" : "text-gray-800"}`}>{t(`layout.${l}`)}</span>
                <span className="block text-[10px] leading-snug text-gray-500">{t(`layout.${l}_desc`)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-gray-400">{t("admin.layout_hint")}</p>
    </div>
  );
}
