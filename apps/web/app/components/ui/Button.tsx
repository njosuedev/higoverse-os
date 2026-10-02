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
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

function variantClasses(variant: Variant, tone: Tone): string {
  if (variant === "danger") {
    return "bg-accent text-white hover:bg-accent-dark";
  }
  if (variant === "ghost") {
    return "bg-transparent text-text-muted hover:bg-paper-dim hover:text-text";
  }
  if (tone === "orange") {
    return variant === "primary"
      ? "bg-accent text-white hover:bg-accent-dark"
      : "bg-accent-soft text-accent-dark border border-accent/25 hover:bg-[#f9d6d8]";
  }
  return variant === "primary"
    ? "bg-ink text-white hover:bg-ink-dark"
    : "bg-white text-ink border border-ink hover:bg-ink-soft hover:shadow-[inset_0_0_0_1px_var(--color-ink)]";
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
  const classes = `inline-flex items-center justify-center rounded-full font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${SIZE_MAP[size]} ${variantClasses(
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
