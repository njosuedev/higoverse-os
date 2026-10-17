"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, ChevronDown, Globe, Lock, Mail, MapPin, MessageCircle, Monitor, Phone, Smartphone,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { LANGUAGES, type Lang } from "@/lib/i18n";
import { hasSignedInCookie } from "@/lib/auth";
import { SITE } from "@/lib/site";
import type { AppReleases } from "@/lib/app-releases";
import { SOLUTIONS } from "@/lib/solutions";
import { FAQ_COUNT } from "./faq";

const FEATURES = ["stock", "sales", "purchases", "expenses", "debts", "proforma", "payroll", "reports", "team", "messages"] as const;

const FACTS = ["local", "devices", "languages", "private"] as const;

const SOCIAL = [
  { name: "Facebook", href: SITE.social[0] },
  { name: "Instagram", href: SITE.social[1] },
  { name: "X", href: SITE.social[2] },
];

/** WhatsApp chat with Higoverse, the first message already written in the visitor's language. */
function whatsappLink(text: string) {
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}`;
}

export default function Landing({ releases }: { releases: AppReleases }) {
  const { t, lang, setLang } = useLanguage();
  const { ready, user } = useAuth();
  const whatsapp = whatsappLink(t("home.whatsapp_message"));

  // Signed in on this browser from before the "signed in" flag existed: the
  // flag is now set (AuthProvider), so the same address shows the dashboard.
  useEffect(() => {
    if (ready && user && hasSignedInCookie()) window.location.replace("/");
  }, [ready, user]);

  return (
    <div className="min-h-screen bg-paper text-text">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-press focus:bg-white focus:px-3 focus:py-2">
        {t("home.skip")}
      </a>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Higoverse">
            <Image src="/higoverse-logo.png" alt="" width={32} height={32} className="rounded-press" priority />
            <span className="font-display text-lg font-bold">Higoverse</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-text-muted lg:flex" aria-label={t("home.nav_label")}>
            <a href="#features" className="hover:text-text">{t("home.nav_features")}</a>
            <a href="#car-dealers" className="hover:text-text">{t("home.nav_cars")}</a>
            <a href="#questions" className="hover:text-text">{t("home.nav_faq")}</a>
            <Link href="/download" className="hover:text-text">{t("home.nav_download")}</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <label className="sr-only" htmlFor="home-lang">{t("home.lang_label")}</label>
            <select
              id="home-lang"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="h-10 cursor-pointer rounded-press border border-border bg-white px-2 text-sm text-text"
            >
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <Link href="/login" className="flex h-10 items-center rounded-press bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-dark">
              {t("home.sign_in")}
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ── Opening ── */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-12 pt-12 sm:px-6 md:grid-cols-[1.1fr_1fr] md:items-center md:pb-16 md:pt-20">
          <div>
            <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">{t("home.title")}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-muted">{t("home.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-press bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-ink-dark">
                <MessageCircle size={17} /> {t("home.whatsapp")}
              </a>
              <Link href="/login" className="flex items-center gap-2 rounded-press border border-border-strong bg-white px-5 py-3 text-sm font-semibold text-text hover:bg-paper-dim">
                {t("home.sign_in")} <ArrowRight size={16} />
              </Link>
            </div>
            <p className="mt-4 text-sm text-text-muted">
              {t("home.or_call")}{" "}
              <a href={`tel:${SITE.phone}`} className="font-semibold text-text hover:text-ink">{SITE.phoneDisplay}</a>
            </p>
          </div>

          <Preview t={t} />
        </section>

        {/* ── Facts ── */}
        <section aria-label={t("home.facts_label")} className="border-y border-border bg-white">
          <ul className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {FACTS.map((key) => (
              <li key={key} className="border-l border-border-strong pl-4">
                <p className="font-semibold">{t(`home.fact_${key}`)}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-text-muted">{t(`home.fact_${key}_text`)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Features ── */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-20">
          <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight">{t("home.features_title")}</h2>
          <p className="mt-3 max-w-2xl text-text-muted">{t("home.features_sub")}</p>
          <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
            {FEATURES.map((key, i) => (
              <li key={key} className="border-t border-text pt-4">
                <span className="font-display text-sm tabular-nums text-text-muted" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-semibold">{t(`home.f_${key}`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{t(`home.f_${key}_text`)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Car dealers and shops ── */}
        <section className="border-y border-border bg-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 md:gap-16 md:py-20">
            <Audience id="car-dealers" title={t("home.cars_title")} intro={t("home.cars_sub")}
              points={[1, 2, 3, 4].map((n) => t(`home.cars_${n}`))} />
            <Audience id="shops" title={t("home.shops_title")} intro={t("home.shops_sub")}
              points={[1, 2, 3, 4].map((n) => t(`home.shops_${n}`))} />
          </div>
        </section>

        {/* ── Getting started and platforms ── */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight">{t("home.start_title")}</h2>
            <ol className="mt-8 space-y-6">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-5 border-t border-border pt-5">
                  <span className="w-10 shrink-0 font-display text-3xl font-bold leading-none tabular-nums text-text-muted" aria-hidden="true">{n}</span>
                  <div>
                    <h3 className="font-semibold">{t(`home.start_${n}`)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">{t(`home.start_${n}_text`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <aside className="self-start rounded-data border border-border bg-white p-5" aria-labelledby="platforms">
            <h2 id="platforms" className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{t("home.available_on")}</h2>
            <ul className="mt-3 divide-y divide-border">
              <Platform icon={<Globe size={20} strokeWidth={1.5} />} name={t("home.platform_web")} detail="higoverse.com" href="/login" action={t("home.open")} />
              <Platform icon={<Smartphone size={20} strokeWidth={1.5} />} name="Android"
                detail={releases.android ? t("home.version").replace("{v}", releases.android.version) : t("home.platform_android")}
                href="/download" action={t("home.download")} />
              <Platform icon={<Monitor size={20} strokeWidth={1.5} />} name="Windows"
                detail={releases.windows ? t("home.version").replace("{v}", releases.windows.version) : t("home.platform_windows")}
                href="/download" action={t("home.download")} />
            </ul>
          </aside>
        </section>

        {/* ── Questions ── */}
        <section id="questions" className="scroll-mt-20 border-t border-border bg-white" aria-labelledby="faq-title">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-[1fr_1.7fr] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <h2 id="faq-title" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t("home.faq_title")}</h2>
              <p className="mt-3 leading-relaxed text-text-muted">{t("home.faq_sub")}</p>

              <div className="mt-8 rounded-data border border-border bg-paper p-5">
                <p className="font-semibold">{t("home.faq_more_title")}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{t("home.faq_more_text")}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-press bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-dark">
                    <MessageCircle size={16} aria-hidden="true" /> {t("home.whatsapp")}
                  </a>
                  <a href={`tel:${SITE.phone}`} className="inline-flex items-center gap-2 text-sm font-semibold text-text hover:text-ink">
                    <Phone size={15} aria-hidden="true" /> {SITE.phoneDisplay}
                  </a>
                </div>
              </div>
            </div>

            <div>
              <div className="space-y-3">
                {Array.from({ length: FAQ_COUNT }, (_, i) => (
                  // Same name: opening one question closes the one before (browsers without it just keep both open).
                  <details key={i} name="home-faq" open={i === 0}
                    className="group rounded-data border border-border bg-paper transition-colors open:border-border-strong open:bg-white open:shadow-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-4 rounded-data p-5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
                      <span className="w-6 shrink-0 font-display text-sm text-text-muted tabular-nums group-open:text-ink" aria-hidden="true">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1">{t(`home.faq${i + 1}_q`)}</span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-white text-text-muted transition-transform group-open:rotate-180 group-open:border-ink group-open:text-ink" aria-hidden="true">
                        <ChevronDown size={16} />
                      </span>
                    </summary>
                    <p className="-mt-1 pb-5 pl-[3.75rem] pr-5 leading-relaxed text-text-muted sm:pr-14">{t(`home.faq${i + 1}_a`)}</p>
                  </details>
                ))}
              </div>
              <p className="mt-6 flex items-center gap-2 text-sm text-text-muted">
                <Lock size={15} className="shrink-0" aria-hidden="true" />
                <span>
                  {t("home.privacy_line")}{" "}
                  <Link href="/privacy" className="font-semibold text-ink hover:underline">{t("home.privacy_link")}</Link>
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* ── Contact ── */}
        <section id="contact" className="scroll-mt-20 border-t border-border" aria-labelledby="contact-title">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <div className="grid overflow-hidden rounded-data border border-border bg-white shadow-sm md:grid-cols-[1.1fr_1fr]">
              <div className="p-6 sm:p-10">
                <h2 id="contact-title" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t("home.contact_title")}</h2>
                <p className="mt-3 max-w-md leading-relaxed text-text-muted">{t("home.contact_sub")}</p>
                <ul className="mt-7 space-y-3">
                  {[1, 2, 3].map((n) => (
                    <li key={n} className="flex gap-3 text-[15px] leading-relaxed">
                      <Dash />
                      {t(`home.contact_help_${n}`)}
                    </li>
                  ))}
                </ul>
                <p className="mt-8 flex items-center gap-2 text-sm text-text-muted">
                  <MapPin size={16} className="shrink-0" aria-hidden="true" /> {t("home.location")}
                </p>
              </div>

              <ul className="flex flex-col justify-center gap-3 border-t border-border bg-paper p-6 sm:p-10 md:border-l md:border-t-0">
                <ContactRow href={whatsapp} external icon={<MessageCircle size={22} strokeWidth={1.5} />}
                  label={t("home.contact_whatsapp")} value={SITE.phoneDisplay} action={t("home.contact_whatsapp_action")} />
                <ContactRow href={`tel:${SITE.phone}`} icon={<Phone size={22} strokeWidth={1.5} />}
                  label={t("home.contact_call")} value={SITE.phoneDisplay} action={t("home.contact_call_action")} />
                <ContactRow href={`mailto:${SITE.contactEmail}`} icon={<Mail size={22} strokeWidth={1.5} />}
                  label={t("home.contact_email")} value={SITE.contactEmail} action={t("home.contact_email_action")} />
              </ul>
            </div>
          </div>
        </section>
        {/* ── Solution pages (also how search engines find them) ── */}
        <nav aria-labelledby="solutions-title" className="border-t border-border bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <h2 id="solutions-title" className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{t("home.solutions")}</h2>
            <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {SOLUTIONS.map((s) => (
                <li key={s.slug}>
                  <Link href={`/solutions/${s.slug}`} lang={s.lang} className="text-sm font-semibold text-ink hover:underline">{s.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </main>

      <footer className="border-t border-border pb-20 md:pb-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-sm text-text-muted sm:px-6">
          <span>© {new Date().getFullYear()} Higoverse · {t("home.location")}</span>
          <Link href="/login" className="hover:text-text">{t("home.sign_in")}</Link>
          <Link href="/download" className="hover:text-text">{t("home.nav_download")}</Link>
          <Link href="/solutions" className="hover:text-text">{t("home.solutions")}</Link>
          <Link href="/privacy" className="hover:text-text">{t("home.privacy_link")}</Link>
          <span className="flex gap-4 md:ml-auto">
            {SOCIAL.map((s) => (
              <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" className="hover:text-text">{s.name}</a>
            ))}
          </span>
        </div>
      </footer>

      {/* On phones the WhatsApp chat stays one tap away while reading. */}
      <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={t("home.whatsapp")}
        className="fixed bottom-4 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white shadow-lg hover:bg-ink-dark md:hidden">
        <MessageCircle size={20} aria-hidden="true" /> WhatsApp
      </a>
    </div>
  );
}

/** What Higoverse shows a shop owner, drawn with sample figures (labelled as an example). */
function Preview({ t }: { t: (key: string) => string }) {
  const stats = [
    { key: "sales", value: "1,284,500" },
    { key: "expenses", value: "215,000" },
    { key: "profit", value: "362,800", good: true },
  ];
  const low = [
    { name: "Rice 25 kg", left: 3 },
    { name: "Cooking oil 5 L", left: 5 },
  ];
  const recent = [
    { who: "Uwase", amount: "84,000", paid: true },
    { who: "Mugisha", amount: "250,000", paid: false },
    { who: "Keza", amount: "36,500", paid: true },
  ];
  return (
    <figure className="rounded-data border border-border bg-white p-5 shadow-sm" aria-label={t("home.preview_label")}>
      <figcaption className="flex items-center justify-between text-xs text-text-muted">
        <span className="font-semibold uppercase tracking-[0.14em]">{t("home.preview_today")}</span>
        <span className="rounded-full bg-paper-dim px-2 py-0.5">{t("home.preview_label")}</span>
      </figcaption>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.key} className="rounded-press bg-paper p-3">
            <dt className="text-xs text-text-muted">{t(`home.preview_${s.key}`)}</dt>
            <dd className={`mt-1 text-sm font-bold sm:text-base ${s.good ? "text-success" : ""}`}>{s.value}</dd>
            <dd className="text-[11px] text-text-muted">RWF</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-text-muted">{t("home.preview_low")}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {low.map((p) => (
              <li key={p.name} className="flex justify-between gap-2">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 font-semibold text-warning">{p.left}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-text-muted">{t("home.preview_recent")}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {recent.map((s) => (
              <li key={s.who} className="flex justify-between gap-2">
                <span className="truncate">{s.who}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {!s.paid && <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold text-accent">{t("home.preview_balance")}</span>}
                  {s.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </figure>
  );
}

function Platform({ icon, name, detail, href, action }: { icon: React.ReactNode; name: string; detail: string; href: string; action: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="shrink-0 text-text" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{name}</p>
        <p className="truncate text-sm text-text-muted">{detail}</p>
      </div>
      <Link href={href} className="shrink-0 text-sm font-semibold text-ink hover:underline">{action}</Link>
    </li>
  );
}

/** One way to reach Higoverse: the whole row is the link, so it is easy to tap on a phone. */
function ContactRow({ href, external, icon, label, value, action }: {
  href: string; external?: boolean; icon: React.ReactNode; label: string; value: string; action: string;
}) {
  return (
    <li>
      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="group flex items-center gap-4 rounded-data border border-border bg-white p-4 transition-colors hover:border-ink focus-visible:border-ink">
        <span className="shrink-0 text-text" aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-text-muted">{label}</span>
          <span className="block truncate font-semibold">{value}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink">
          <span className="hidden sm:inline">{action}</span>
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </a>
    </li>
  );
}

/** A short rule used as the list marker, in place of coloured check icons. */
function Dash() {
  return <span className="mt-[0.75em] h-px w-3 shrink-0 bg-text" aria-hidden="true" />;
}

function Audience({ id, title, intro, points }: { id: string; title: string; intro: string; points: string[] }) {
  return (
    <div id={id} className="scroll-mt-20 border-t-2 border-text pt-6">
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-2 text-text-muted">{intro}</p>
      <ul className="mt-6 divide-y divide-border border-y border-border">
        {points.map((p) => (
          <li key={p} className="flex gap-3 py-3 text-[15px] leading-relaxed">
            <Dash /> <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
