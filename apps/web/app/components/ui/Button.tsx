"use client";

import React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Tone = "blue" | "orange";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  href?: string;
}

const SIZE_MAP: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

function variantClasses(variant: Variant, tone: Tone): string {
  if (variant === "danger") {
    return "bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow-md";
  }
  if (variant === "ghost") {
    return "bg-transparent text-slate-600 hover:bg-slate-100";
  }
  if (tone === "orange") {
    return variant === "primary"
      ? "bg-orange-500 text-white hover:bg-orange-600 shadow-sm hover:shadow-md"
      : "bg-orange-50 text-orange-700 border border-orange-100 hover:bg-orange-100";
  }
  return variant === "primary"
    ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md"
    : "bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100";
}

export default function Button({
  variant = "primary",
  tone = "blue",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  href,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = `inline-flex items-center justify-center rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${SIZE_MAP[size]} ${variantClasses(
    variant,
    tone
  )} ${fullWidth ? "w-full" : ""} ${className}`;

  const content = (
    <>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}
