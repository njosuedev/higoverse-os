"use client";

import React from "react";
import Button from "./Button";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  tone?: "blue" | "orange";
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  tone = "blue",
  className = "",
}: EmptyStateProps) {
  const swatch = tone === "orange" ? "bg-orange-50 text-orange-500" : "bg-blue-50 text-blue-500";

  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${swatch}`}>{icon}</div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-500">{description}</p>}
      {actionLabel && (onAction || actionHref) && (
        <Button variant="primary" tone={tone} size="md" className="mt-5" onClick={onAction} href={actionHref}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
