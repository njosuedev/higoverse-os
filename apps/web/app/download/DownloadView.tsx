"use client";

import Image from "next/image";
import Link from "next/link";
import { Download, Monitor, Smartphone } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import type { AppRelease, AppReleases } from "@/lib/app-releases";

export default function DownloadView({ releases }: { releases: AppReleases }) {
  const { t, lang } = useLanguage();
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link href="/login" className="flex items-center gap-3">
            <Image src="/higoverse-logo.png" alt="Higoverse" width={30} height={30} className="rounded-press" />
            <span className="font-display text-lg font-bold text-text">Higoverse</span>
          </Link>
          <Link href="/login" className="ml-auto text-sm font-semibold text-ink hover:underline">{t("dl.sign_in")}</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-bold text-text">{t("dl.title")}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-text-muted">{t("dl.subtitle")}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <AppCard icon={<Monitor size={20} />} name="Windows" needs={t("dl.windows_req")} release={releases.windows}
            button={t("dl.download_windows")} lang={lang} />
          <AppCard icon={<Smartphone size={20} />} name="Android" needs={t("dl.android_req")} release={releases.android}
            button={t("dl.download_android")} lang={lang} />
        </div>
        <p className="mt-3 text-sm text-text-muted">{t("dl.updates")}</p>

        {/* Windows SmartScreen */}
        <section className="mt-12 border-t border-border pt-8" aria-labelledby="win-warning">
          <h2 id="win-warning" className="font-display text-xl font-bold text-text">{t("dl.win_title")}</h2>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-text-muted">{t("dl.win_why")}</p>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            <Step n={1} text={t("dl.win_step1")}><SmartScreen stage="info" /></Step>
            <Step n={2} text={t("dl.win_step2")}><SmartScreen stage="run" /></Step>
            <Step n={3} text={t("dl.win_step3")} />
          </ol>
          {releases.windows?.sha256 && <Fingerprint label={t("dl.fingerprint")} file={fileName(releases.windows)} sha={releases.windows.sha256} />}
        </section>

        {/* Android: installs from outside Google Play */}
        <section className="mt-12 border-t border-border pt-8" aria-labelledby="android-warning">
          <h2 id="android-warning" className="font-display text-xl font-bold text-text">{t("dl.android_title")}</h2>
          <ol className="mt-5 max-w-3xl space-y-3">
            {["dl.android_step1", "dl.android_step2", "dl.android_step3"].map((k, i) => (
              <li key={k} className="flex gap-3 text-[15px] leading-relaxed text-text">
                <StepNumber n={i + 1} />
                <span className="pt-0.5">{t(k)}</span>
              </li>
            ))}
          </ol>
          {releases.android?.sha256 && <Fingerprint label={t("dl.fingerprint")} file={fileName(releases.android)} sha={releases.android.sha256} />}
        </section>

        <p className="mt-12 border-t border-border pt-6 text-sm text-text-muted">
          {t("dl.help")}{" "}
          <a href="mailto:higoverse@gmail.com" className="font-semibold text-ink hover:underline">higoverse@gmail.com</a>
        </p>
      </main>
    </div>
  );
}

function fileName(r: AppRelease) {
  return r.download_url.split("/").pop() ?? "";
}

function AppCard({ icon, name, needs, release, button, lang }: {
  icon: React.ReactNode; name: string; needs: string; release: AppRelease | null; button: string; lang: string;
}) {
  const { t } = useLanguage();
  const facts = release ? [
    t("dl.version").replace("{v}", release.version),
    release.size ? `${Math.round(release.size / 1048576)} MB` : "",
    release.published_at ? new Date(release.published_at).toLocaleDateString(lang === "rw" ? "en-GB" : lang, { day: "numeric", month: "short", year: "numeric" }) : "",
  ].filter(Boolean) : [];
  return (
    <div className="flex flex-col rounded-data border border-border bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-press bg-ink-soft text-ink">{icon}</span>
        <div>
          <h2 className="font-display text-lg font-bold text-text">{name}</h2>
          <p className="text-sm text-text-muted">{needs}</p>
        </div>
      </div>
      {release ? (
        <>
          <p className="mt-4 text-sm text-text-muted">{facts.join(" · ")}</p>
          <a href={release.download_url} download
            className="mt-4 flex items-center justify-center gap-2 rounded-press bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-dark">
            <Download size={16} /> {button}
          </a>
        </>
      ) : (
        <p className="mt-4 rounded-press bg-paper-dim px-3 py-2.5 text-sm text-text-muted">{t("dl.unavailable")}</p>
      )}
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong text-sm font-bold text-text">{n}</span>
  );
}

function Step({ n, text, children }: { n: number; text: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3">
      <div className="flex gap-3">
        <StepNumber n={n} />
        <p className="pt-0.5 text-[15px] leading-relaxed text-text">{text}</p>
      </div>
      {children}
    </li>
  );
}

/** A small drawing of Windows' SmartScreen box (as Windows shows it, in
 *  English), with the place to click outlined. Decorative: the step's text
 *  says the same. */
function SmartScreen({ stage }: { stage: "info" | "run" }) {
  const mark = "outline outline-2 outline-offset-2 outline-[#ffd200] rounded-[1px]";
  return (
    <div aria-hidden="true" className="flex h-[140px] select-none flex-col overflow-hidden rounded-[3px] bg-[#c42b1c] p-3 text-[#ffffff] shadow-sm" style={{ fontFamily: "Segoe UI, system-ui, sans-serif" }}>
      <p className="text-[15px] font-light leading-tight">Windows protected your PC</p>
      <p className="mt-1.5 text-[9.5px] leading-snug text-white/90">
        Microsoft Defender SmartScreen prevented an unrecognized app from starting.
      </p>
      {stage === "info" ? (
        <>
          <p className="mt-1.5 text-[10px]"><span className={`underline ${mark}`}>More info</span></p>
          <div className="mt-auto flex justify-end">
            <span className="bg-[#ffffff] px-2.5 py-1 text-[10px] font-semibold text-[#000000]">Don&apos;t run</span>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[9.5px] text-white/90">App: <span className="text-white">Higoverse-Setup.exe</span></p>
          <p className="text-[9.5px] text-white/90">Publisher: Unknown publisher</p>
          <div className="mt-auto flex justify-end gap-1.5">
            <span className={`border border-[#ffffff] px-2.5 py-1 text-[10px] font-semibold ${mark}`}>Run anyway</span>
            <span className="bg-[#ffffff] px-2.5 py-1 text-[10px] font-semibold text-[#000000]">Don&apos;t run</span>
          </div>
        </>
      )}
    </div>
  );
}

function Fingerprint({ label, file, sha }: { label: string; file: string; sha: string }) {
  return (
    <details className="mt-6 max-w-3xl rounded-data border border-border bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-text">{label}</summary>
      <p className="mt-2 text-text-muted">{file}</p>
      <code className="mt-1 block break-all font-mono text-[12.5px] text-text">SHA-256 {sha}</code>
    </details>
  );
}
