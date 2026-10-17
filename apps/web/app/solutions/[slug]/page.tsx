import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MessageCircle, Phone } from "lucide-react";
import { SITE } from "@/lib/site";
import { SOLUTIONS, solutionBySlug, solutionUi } from "@/lib/solutions";
import { SiteFooter, SiteHeader } from "../chrome";

// One public page per search people make (lib/solutions.ts). Server-rendered
// and static, so search engines read every word without running scripts.

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return SOLUTIONS.map((s) => ({ slug: s.slug }));
}

const OG_LOCALE = { en: "en_US", rw: "rw_RW", fr: "fr_FR" } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = solutionBySlug((await params).slug);
  if (!s) return {};
  const path = `/solutions/${s.slug}`;
  return {
    title: s.title,
    description: s.description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      title: `${s.title} | ${SITE.name}`,
      description: s.description,
      url: path,
      locale: OG_LOCALE[s.lang],
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE.name} · ${SITE.shortTitle}` }],
    },
    twitter: { card: "summary_large_image", title: `${s.title} | ${SITE.name}`, description: s.description },
  };
}

export default async function SolutionPage({ params }: Props) {
  const s = solutionBySlug((await params).slug);
  if (!s) notFound();
  const t = solutionUi(s);
  const url = `${SITE.url}/solutions/${s.slug}`;
  const whatsapp = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(t.whatsappMessage)}`;
  const others = SOLUTIONS.filter((o) => o.slug !== s.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: s.title,
        description: s.description,
        inLanguage: s.lang,
        isPartOf: { "@id": `${SITE.url}/#website` },
        about: { "@id": `${SITE.url}/#organization` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE.name, item: SITE.url },
          { "@type": "ListItem", position: 2, name: t.solutions, item: `${SITE.url}/solutions` },
          { "@type": "ListItem", position: 3, name: s.name, item: url },
        ],
      },
      {
        "@type": "SoftwareApplication",
        name: SITE.name,
        url: SITE.url,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Android, Windows",
        description: s.description,
        areaServed: { "@type": "Country", name: "Rwanda" },
        publisher: { "@id": `${SITE.url}/#organization` },
      },
      {
        "@type": "FAQPage",
        mainEntity: s.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };

  return (
    <div lang={s.lang} className="min-h-screen bg-paper text-text">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SiteHeader home={t.home} />

      <main>
        <section className="mx-auto max-w-4xl px-4 pb-12 pt-10 sm:px-6 md:pt-16">
          <nav aria-label="Breadcrumb" className="text-sm text-text-muted">
            <Link href="/" className="hover:text-text">{SITE.name}</Link>
            <span aria-hidden="true"> / </span>
            <Link href="/solutions" className="hover:text-text">{t.solutions}</Link>
            <span aria-hidden="true"> / </span>
            <span>{s.name}</span>
          </nav>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">{s.h1}</h1>
          <p className="mt-5 text-lg leading-relaxed text-text-muted">{s.intro}</p>
          <ContactButtons whatsapp={whatsapp} t={t} />
          <p className="mt-4 text-sm text-text-muted">{t.available}</p>
        </section>

        <section className="border-y border-border bg-white" aria-labelledby="for-who">
          <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
            <h2 id="for-who" className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{t.forWho}</h2>
            <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {s.forWho.map((w) => <li key={w} className="flex gap-3"><Dash />{w}</li>)}
            </ul>
          </div>
        </section>

        <div className="mx-auto max-w-4xl space-y-12 px-4 py-14 sm:px-6">
          {s.sections.map((sec) => (
            <section key={sec.title} className="border-t-2 border-text pt-5">
              <h2 className="font-display text-2xl font-bold tracking-tight">{sec.title}</h2>
              <p className="mt-3 leading-relaxed text-text-muted">{sec.text}</p>
              {sec.points && (
                <ul className="mt-5 divide-y divide-border border-y border-border">
                  {sec.points.map((p) => <li key={p} className="flex gap-3 py-3 text-[15px] leading-relaxed"><Dash /><span>{p}</span></li>)}
                </ul>
              )}
            </section>
          ))}
        </div>

        <section className="border-t border-border bg-white" aria-labelledby="faq">
          <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
            <h2 id="faq" className="font-display text-3xl font-bold tracking-tight">{t.faq}</h2>
            <dl className="mt-8 space-y-6">
              {s.faq.map(({ q, a }) => (
                <div key={q} className="border-t border-border pt-5">
                  <dt className="font-semibold">{q}</dt>
                  <dd className="mt-2 leading-relaxed text-text-muted">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-border" aria-labelledby="start">
          <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
            <div className="rounded-data border border-border bg-white p-6 shadow-sm sm:p-10">
              <h2 id="start" className="font-display text-3xl font-bold tracking-tight">{t.start}</h2>
              <p className="mt-3 max-w-xl leading-relaxed text-text-muted">{t.startText}</p>
              <ContactButtons whatsapp={whatsapp} t={t} />
            </div>

            <h2 className="mt-14 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{t.more}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/solutions/${o.slug}`} className="group flex items-center justify-between gap-3 rounded-press border border-border bg-white px-4 py-3 text-sm font-semibold hover:border-ink">
                    <span lang={o.lang}>{o.title}</span>
                    <ArrowRight size={16} className="shrink-0 text-ink" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function ContactButtons({ whatsapp, t }: { whatsapp: string; t: ReturnType<typeof solutionUi> }) {
  return (
    <div className="mt-7 flex flex-wrap items-center gap-3">
      <a href={whatsapp} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-press bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-ink-dark">
        <MessageCircle size={17} aria-hidden="true" /> {t.whatsapp}
      </a>
      <a href={`tel:${SITE.phone}`}
        className="flex items-center gap-2 rounded-press border border-border-strong bg-white px-5 py-3 text-sm font-semibold text-text hover:bg-paper-dim">
        <Phone size={16} aria-hidden="true" /> {t.call} {SITE.phoneDisplay}
      </a>
    </div>
  );
}

function Dash() {
  return <span className="mt-[0.75em] h-px w-3 shrink-0 bg-text" aria-hidden="true" />;
}
