import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/site";

// Header and footer of the public solution pages.

export function SiteHeader({ home }: { home: string }) {
  return (
    <header className="border-b border-border bg-paper">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${SITE.name} · ${home}`}>
          <Image src="/higoverse-logo.png" alt="" width={32} height={32} className="rounded-press" priority />
          <span className="font-display text-lg font-bold">{SITE.name}</span>
        </Link>
        <Link href="/login" className="ml-auto flex h-10 items-center rounded-press bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-dark">
          Sign in
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-sm text-text-muted sm:px-6">
        <span>© {new Date().getFullYear()} {SITE.name} · {SITE.city}, Rwanda</span>
        <Link href="/" className="hover:text-text">Home</Link>
        <Link href="/solutions" className="hover:text-text">Solutions</Link>
        <Link href="/download" className="hover:text-text">Download</Link>
        <Link href="/privacy" className="hover:text-text">Privacy policy</Link>
      </div>
    </footer>
  );
}
