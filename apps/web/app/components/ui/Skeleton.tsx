"use client";

import React from "react";

type Rounded = "md" | "lg" | "xl" | "2xl" | "full";

interface SkeletonProps {
  className?: string;
  rounded?: Rounded;
}

const ROUNDED_MAP: Record<Rounded, string> = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
};

/** One shimmer block. Compose these to build page-specific skeletons. */
export default function Skeleton({ className = "h-4 w-full", rounded = "lg" }: SkeletonProps) {
  return <div className={`hgv-shimmer ${ROUNDED_MAP[rounded]} ${className}`} />;
}
