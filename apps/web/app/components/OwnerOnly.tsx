"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useCanSeeFinancials } from "@/lib/permissions";
import { useLanguage } from "@/lib/language-context";

/** Wraps pages that are entirely company finances (expenses, reports). Car
 *  companies' staff get a plain explanation instead of the page; the backend
 *  refuses their requests too, so this is about clarity, not enforcement. */
export default function OwnerOnly({ children }: { children: React.ReactNode }) {
  const allowed = useCanSeeFinancials();
  const { t } = useLanguage();
  if (allowed) return <>{children}</>;
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-paper-dim">
        <Lock size={24} className="text-text-muted" />
      </div>
      <h1 className="mt-4 font-display text-xl font-semibold text-text">{t("access.owner_only_title")}</h1>
      <p className="mt-2 text-[15px] text-text-muted">{t("access.owner_only_body")}</p>
      <Link href="/" className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-dark">
        {t("nav.dashboard")}
      </Link>
    </main>
  );
}
