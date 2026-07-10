import Link from "next/link";
import {
  Phone,
  Mail,
  MapPin,
  Banknote,
  Smartphone,
  Truck,
  ShieldCheck,
  Headset,
  Trophy,
  BadgeCheck,
  PackageCheck,
  Globe2,
} from "lucide-react";
import { CATEGORIES } from "@/lib/categories";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "All Products", href: "/products" },
      { label: "All Categories", href: "/categories" },
      { label: "Search Products", href: "/search" },
      { label: "Your Cart", href: "/cart" },
    ],
  },
  {
    title: "Top Categories",
    links: CATEGORIES.slice(0, 4).map((c) => ({ label: c.label, href: `/category/${c.key}` })),
  },
  {
    title: "Customer Service",
    links: [
      { label: "My Orders", href: "/orders" },
      { label: "Contact Support", href: "/contact" },
    ],
  },
  {
    title: "About Higoverse",
    links: [
      { label: "Our Story", href: "/about" },
      { label: "Contact Us", href: "/contact" },
    ],
  },
];

const TRUST_BADGES = [
  { icon: Trophy, title: "#1 in East Africa", subtitle: "Fastest-growing marketplace" },
  { icon: Truck, title: "Fast Delivery", subtitle: "Across Rwanda & beyond" },
  { icon: ShieldCheck, title: "Secure Shopping", subtitle: "Your data is protected" },
  { icon: PackageCheck, title: "Quality Checked", subtitle: "Verified sellers & listings" },
  { icon: BadgeCheck, title: "Genuine Products", subtitle: "No counterfeits, ever" },
  { icon: Headset, title: "Dedicated Support", subtitle: "Here when you need us" },
];

export default function PublicFooter() {
  return (
    <footer className="bg-white text-neutral-600">
      {/* ── Trust strip ── */}
      <div className="border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-6 px-4 py-8 sm:px-6 lg:grid-cols-3 xl:grid-cols-6">
          {TRUST_BADGES.map(({ icon: Icon, title, subtitle }) => (
            <div key={title} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600">
                <Icon size={20} />
              </span>
              <span>
                <p className="text-sm font-bold text-neutral-900">{title}</p>
                <p className="text-xs text-neutral-500">{subtitle}</p>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Brand + coverage + call to order ── */}
      <div className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <img src="/higoverse.png" alt="Higoverse" className="h-11 w-11 rounded-xl object-cover" />
            <div>
              <p className="text-lg font-bold tracking-tight text-neutral-900">Higoverse</p>
              <p className="text-sm text-neutral-500">
                Proudly East Africa&apos;s <span className="font-semibold text-orange-600">#1</span> marketplace &mdash; quality products, delivered.
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
                <Globe2 size={13} className="shrink-0" />
                Serving Rwanda today, growing across East Africa.
              </p>
            </div>
          </div>
          <a
            href="tel:+250790885174"
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-3 transition hover:border-orange-500/50 hover:bg-orange-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600">
              <Phone size={18} />
            </span>
            <span>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Call to order</p>
              <p className="text-base font-bold text-neutral-900">+250 790 885 174</p>
            </span>
          </a>
        </div>
      </div>

      {/* ── Link columns + contact + payment ── */}
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-neutral-600 transition hover:text-orange-600">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Contact Us</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li className="flex items-center gap-2">
                <Phone size={13} className="shrink-0 text-neutral-400" />
                <a href="tel:+250790885174" className="text-neutral-600 transition hover:text-orange-600">+250 790 885 174</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={13} className="shrink-0 text-neutral-400" />
                <a href="mailto:support@higoverse.com" className="text-neutral-600 transition hover:text-orange-600">support@higoverse.com</a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin size={13} className="mt-0.5 shrink-0 text-neutral-400" />
                <span className="text-neutral-600">Kigali, Rwanda &middot; Serving East Africa</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Payment methods */}
        <div className="mt-10 border-t border-neutral-200 pt-8">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Payment Methods</p>
          <p className="mt-1 text-xs text-neutral-500">Pay however works best for you &mdash; no hidden fees.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <span className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-600">
              <Banknote size={14} className="text-orange-600" /> Cash on Delivery
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-600">
              <Smartphone size={14} className="text-orange-600" /> Mobile Money
            </span>
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© 2020–{new Date().getFullYear()} Higoverse. East Africa&apos;s #1 marketplace. Business Technology Company.</span>
          <span className="flex items-center gap-3">
            <span>🇷🇼 Rwanda · RWF</span>
            <span className="hidden text-neutral-300 sm:inline">|</span>
            <span className="hidden sm:inline">Made with pride in Kigali</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
