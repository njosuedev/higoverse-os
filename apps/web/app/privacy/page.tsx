import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Higoverse handles the information in your account, on the website and in the mobile app.",
  alternates: { canonical: `${SITE.url}/privacy` },
};

const UPDATED = "3 October 2026";

/** Public privacy policy for higoverse.com and the Higoverse mobile app.
 *  Every statement describes how the system actually works. */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <Image src="/higoverse-logo.png" alt="Higoverse" width={30} height={30} className="rounded-press" />
          <span className="font-display text-lg font-bold">Higoverse</span>
          <Link href="/login" className="ml-auto text-sm font-semibold text-ink hover:underline">Sign in</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold text-text">Privacy Policy</h1>
        <p className="mt-2 text-sm text-text-muted">Last updated: {UPDATED}</p>

        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-text">
          <Section title="Who we are">
            <p>
              Higoverse is software that businesses use to record their stock, sales, customers, expenses and invoices.
              This policy covers the website at {SITE.url.replace("https://", "")} and the Higoverse mobile app for Android
              and iOS. Both use the same accounts and the same servers.
            </p>
          </Section>

          <Section title="Accounts">
            <p>
              Higoverse accounts are created for each business by the Higoverse administrator. There is no public sign-up.
              The business decides who on its team has an account and what each person can see.
            </p>
          </Section>

          <Section title="Information we hold">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Your account:</strong> name, email address, role, and your password stored only in hashed form.</li>
              <li>
                <strong>Your business&apos;s records:</strong> what the business enters, such as products, vehicles (with
                plate and chassis numbers and photos), customers and suppliers (name, phone, address and, for car sales, ID
                or passport number), sales, purchases, expenses, debts and invoices.
              </li>
              <li><strong>Technical records:</strong> server logs with times and network addresses, kept for security and troubleshooting.</li>
            </ul>
          </Section>

          <Section title="How the information is used">
            <p>
              Only to run Higoverse for the business that entered it: showing its records, figures and reports to its own
              team. We do not sell information, do not use it for advertising, and do not share it with other businesses.
              The mobile app contains no advertising or third-party tracking.
            </p>
          </Section>

          <Section title="How it is protected">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>All traffic between your device and Higoverse is encrypted (HTTPS).</li>
              <li>Each business&apos;s records are kept separate from every other business.</li>
              <li>The databases are backed up every night, and each backup is checked.</li>
              <li>Owners control what their staff can see.</li>
            </ul>
          </Section>

          <Section title="On your device">
            <p>
              The website and app keep your sign-in on the device so you stay signed in; in the mobile app this is stored in
              the phone&apos;s secure storage. Signing out removes your account&apos;s data from the device. The mobile app
              only needs internet access; it does not use your location, contacts, camera or files.
            </p>
          </Section>

          <Section title="Keeping and deleting information">
            <p>
              Records are kept while the business uses Higoverse. A business can ask for its account and records to be
              deleted, and a person can ask for their own account to be removed, by writing to the contact below. We will
              confirm the request with the business owner before deleting business records.
            </p>
          </Section>

          <Section title="Children">
            <p>Higoverse is a tool for businesses and is not meant for children.</p>
          </Section>

          <Section title="Changes">
            <p>If this policy changes, the new version will be published on this page with a new date.</p>
          </Section>

          <Section title="Contact">
            <p>
              Questions or requests about your information:{" "}
              <a href={`mailto:${SITE.contactEmail}`} className="font-semibold text-ink hover:underline">{SITE.contactEmail}</a>
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t border-border bg-white">
        <p className="mx-auto max-w-3xl px-6 py-5 text-xs text-text-muted">© {new Date().getFullYear()} Higoverse</p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-lg font-bold text-text">{title}</h2>
      {children}
    </section>
  );
}
