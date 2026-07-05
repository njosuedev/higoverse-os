"use client";

import React from "react";

type Padding = "none" | "sm" | "md" | "lg";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  padding?: Padding;
}

const PADDING_MAP: Record<Padding, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export default function Card({
  hoverable = false,
  padding = "md",
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${PADDING_MAP[padding]} ${
        hoverable ? "hgv-card-hover" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
