import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SITE } from "@/lib/site";
import { SOLUTIONS } from "@/lib/solutions";
import { SiteFooter, SiteHeader } from "./chrome";

export const metadata: Metadata = {
  title: "Business Software Solutions for Rwanda",
  description:
    "Higoverse solutions for businesses in Rwanda: inventory management, sales and POS, car dealer software, proforma invoices, customer debt tracking and payroll, in one business management platform.",
  alternates: { canonical: "/solutions" },
};

export default function SolutionsIndex() {
  return (
    <div className="min-h-screen bg-paper text-text">
      <SiteHeader home="Home" />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 md:py-16">
        <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">Business software solutions for Rwanda</h1>
        <p className="mt-5 text-lg leading-relaxed text-text-muted">
          {SITE.name} is one business management platform for shops and car dealers in Rwanda. Every part below works in the same account, on the web, Android and Windows.
        </p>
        <ul className="mt-10 space-y-3">
          {SOLUTIONS.map((s) => (
            <li key={s.slug}>
              <Link href={`/solutions/${s.slug}`} lang={s.lang}
                className="group flex items-start justify-between gap-4 rounded-data border border-border bg-white p-5 hover:border-ink">
                <span>
                  <span className="block font-semibold">{s.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-text-muted">{s.description}</span>
                </span>
                <ArrowRight size={18} className="mt-1 shrink-0 text-ink" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
