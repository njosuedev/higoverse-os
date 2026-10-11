"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BarChart3, Boxes, Car, Check, FileText, Globe, HandCoins, Languages, Mail, MapPin, MessageCircle,
  Monitor, Phone, Receipt, ShieldCheck, ShoppingCart, Smartphone, Store, Truck, Users, Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { hasSignedInCookie } from "@/lib/auth";
import { SITE } from "@/lib/site";
import type { AppReleases } from "@/lib/app-releases";
import { FAQ_COUNT } from "./faq";

const FEATURES = [
  { key: "stock", icon: Boxes },
  { key: "sales", icon: ShoppingCart },
  { key: "purchases", icon: Truck },
  { key: "expenses", icon: Receipt },
  { key: "debts", icon: Wallet },
  { key: "proforma", icon: FileText },
  { key: "payroll", icon: HandCoins },
  { key: "reports", icon: BarChart3 },
  { key: "team", icon: Users },
  { key: "messages", icon: MessageCircle },
] as const;

const PHONE_DISPLAY = "0790 885 174";

export default function Landing({ releases }: { releases: AppReleases }) {
  const { t } = useLanguage();
  const { ready, user } = useAuth();

  // Signed in on this browser from before the "signed in" flag existed: the
  // flag is now set (AuthProvider), so the same address shows the dashboard.
  useEffect(() => {
    if (ready && user && hasSignedInCookie()) window.location.replace("/");
  }, [ready, user]);

  return (
    <div className="min-h-screen bg-paper text-text">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Higoverse">
            <Image src="/higoverse-logo.png" alt="" width={30} height={30} className="rounded-press" priority />
            <span className="font-display text-lg font-bold">Higoverse</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-text-muted md:flex" aria-label={t("home.nav_label")}>
            <a href="#features" className="hover:text-text">{t("home.nav_features")}</a>
            <a href="#car-dealers" className="hover:text-text">{t("home.nav_cars")}</a>
            <a href="#questions" className="hover:text-text">{t("home.nav_faq")}</a>
            <Link href="/download" className="hover:text-text">{t("home.nav_download")}</Link>
          </nav>
          <Link href="/login" className="ml-auto rounded-press bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-dark">
            {t("home.sign_in")}
          </Link>
        </div>
      </header>

      <main>
        {/* ── Opening ── */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_1fr] md:items-center md:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{t("home.kicker")}</p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">{t("home.title")}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-muted">{t("home.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="flex items-center gap-2 rounded-press bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-ink-dark">
                {t("home.sign_in")} <ArrowRight size={16} />
              </Link>
              <a href="#contact" className="rounded-press border border-border-strong bg-white px-5 py-3 text-sm font-semibold text-text hover:bg-paper-dim">
                {t("home.get_account")}
              </a>
            </div>
          </div>

          <aside className="rounded-data border border-border bg-white p-5" aria-labelledby="platforms">
            <h2 id="platforms" className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{t("home.available_on")}</h2>
            <ul className="mt-3 divide-y divide-border">
              <Platform icon={<Globe size={18} />} name={t("home.platform_web")} detail="higoverse.com" href="/login" action={t("home.open")} />
              <Platform icon={<Smartphone size={18} />} name="Android"
                detail={releases.android ? t("home.version").replace("{v}", releases.android.version) : t("home.platform_android")}
                href="/download" action={t("home.download")} />
              <Platform icon={<Monitor size={18} />} name="Windows"
                detail={releases.windows ? t("home.version").replace("{v}", releases.windows.version) : t("home.platform_windows")}
                href="/download" action={t("home.download")} />
            </ul>
            <p className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-sm text-text-muted">
              <Languages size={16} className="mt-0.5 shrink-0" /> {t("home.languages")}
            </p>
          </aside>
        </section>

        {/* ── Features ── */}
        <section id="features" className="scroll-mt-16 border-y border-border bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight">{t("home.features_title")}</h2>
            <p className="mt-3 max-w-2xl text-text-muted">{t("home.features_sub")}</p>
            <div className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {FEATURES.map(({ key, icon: Icon }) => (
                <div key={key} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-press bg-ink-soft text-ink"><Icon size={19} /></span>
                  <div>
                    <h3 className="font-semibold">{t(`home.f_${key}`)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">{t(`home.f_${key}_text`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Car dealers and shops ── */}
        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-2">
          <Audience id="car-dealers" icon={<Car size={20} />} title={t("home.cars_title")} intro={t("home.cars_sub")}
            points={[1, 2, 3, 4].map((n) => t(`home.cars_${n}`))} />
          <Audience id="shops" icon={<Store size={20} />} title={t("home.shops_title")} intro={t("home.shops_sub")}
            points={[1, 2, 3, 4].map((n) => t(`home.shops_${n}`))} />
        </section>

        {/* ── Getting started ── */}
        <section className="border-y border-border bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-3xl font-bold tracking-tight">{t("home.start_title")}</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong font-display font-bold">{n}</span>
                  <div>
                    <h3 className="font-semibold">{t(`home.start_${n}`)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">{t(`home.start_${n}_text`)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-8 flex items-center gap-2 text-sm text-text-muted">
              <ShieldCheck size={16} className="shrink-0 text-success" /> {t("home.privacy_line")}{" "}
              <Link href="/privacy" className="font-semibold text-ink hover:underline">{t("home.privacy_link")}</Link>
            </p>
          </div>
        </section>

        {/* ── Questions ── */}
        <section id="questions" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-bold tracking-tight">{t("home.faq_title")}</h2>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {Array.from({ length: FAQ_COUNT }, (_, i) => (
              <details key={i} className="group py-4" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {t(`home.faq${i + 1}_q`)}
                  <span className="text-xl font-normal text-text-muted transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-text-muted">{t(`home.faq${i + 1}_a`)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Contact ── */}
        <section id="contact" className="scroll-mt-16 border-t border-border bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight">{t("home.contact_title")}</h2>
              <p className="mt-3 max-w-lg text-text-muted">{t("home.contact_sub")}</p>
            </div>
            <ul className="space-y-3 text-[15px]">
              <li><a href={`tel:${SITE.phone}`} className="flex items-center gap-3 font-semibold hover:text-ink"><Phone size={18} className="text-ink" /> {PHONE_DISPLAY}</a></li>
              <li><a href={`mailto:${SITE.contactEmail}`} className="flex items-center gap-3 font-semibold hover:text-ink"><Mail size={18} className="text-ink" /> {SITE.contactEmail}</a></li>
              <li className="flex items-center gap-3 text-text-muted"><MapPin size={18} className="text-ink" /> {t("home.location")}</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-text-muted sm:px-6">
          <span>© {new Date().getFullYear()} Higoverse</span>
          <Link href="/login" className="hover:text-text">{t("home.sign_in")}</Link>
          <Link href="/download" className="hover:text-text">{t("home.nav_download")}</Link>
          <Link href="/privacy" className="hover:text-text">{t("home.privacy_link")}</Link>
        </div>
      </footer>
    </div>
  );
}

function Platform({ icon, name, detail, href, action }: { icon: React.ReactNode; name: string; detail: string; href: string; action: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-press bg-paper-dim text-text">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{name}</p>
        <p className="truncate text-sm text-text-muted">{detail}</p>
      </div>
      <Link href={href} className="shrink-0 text-sm font-semibold text-ink hover:underline">{action}</Link>
    </li>
  );
}

function Audience({ id, icon, title, intro, points }: { id: string; icon: React.ReactNode; title: string; intro: string; points: string[] }) {
  return (
    <div id={id} className="scroll-mt-16 rounded-data border border-border bg-white p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-press bg-ink-soft text-ink">{icon}</span>
      <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-2 text-text-muted">{intro}</p>
      <ul className="mt-5 space-y-3">
        {points.map((p) => (
          <li key={p} className="flex gap-3 text-[15px] leading-relaxed">
            <Check size={18} className="mt-0.5 shrink-0 text-success" /> <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
