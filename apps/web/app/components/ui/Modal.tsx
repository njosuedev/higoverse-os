"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

type Size = "sm" | "md" | "lg" | "xl";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: Size;
}

const SIZE_MAP: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

/** Standardizes modal chrome only (backdrop, panel, header, footer). Callers own their own body state/handlers. */
export default function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  const { t } = useLanguage();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-dark/45 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${SIZE_MAP[size]} max-h-[90vh] overflow-y-auto rounded-data bg-white border border-border shadow-[0_16px_48px_-12px_rgb(0_0_0_/_0.35)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-display text-lg font-semibold text-text">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-press p-1.5 text-text-faint transition-colors duration-200 hover:bg-paper-dim hover:text-text"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
