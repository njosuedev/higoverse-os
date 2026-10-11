// The latest Windows and Android apps, as the apps' own update check sees
// them (settings-service /api/app-updates/latest, written by
// deploy/publish-release.sh). Read on the server, for the download page.

export interface AppRelease {
  version: string;
  download_url: string;
  sha256?: string;
  size?: number;
  published_at?: string;
}

export interface AppReleases { windows: AppRelease | null; android: AppRelease | null }

function feedUrl(): string {
  // Same rule as next.config.ts: a deployed server in local development
  // (HGV_API_ORIGIN), otherwise settings-service on this machine.
  const remote = process.env.HGV_API_ORIGIN?.replace(/\/+$/, "");
  return remote ? `${remote}/settings/api/app-updates/latest` : "http://127.0.0.1:8006/api/app-updates/latest";
}

function release(v: unknown): AppRelease | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  // Only links to our own downloads folder are offered.
  if (typeof r.version !== "string" || typeof r.download_url !== "string" || !r.download_url.startsWith("https://higoverse.com/downloads/")) return null;
  return {
    version: r.version,
    download_url: r.download_url,
    sha256: typeof r.sha256 === "string" ? r.sha256 : undefined,
    size: typeof r.size === "number" ? r.size : undefined,
    published_at: typeof r.published_at === "string" ? r.published_at : undefined,
  };
}

/** Both releases; null for one that can't be read (the page says so). */
export async function latestReleases(): Promise<AppReleases> {
  try {
    const res = await fetch(feedUrl(), { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { windows: null, android: null };
    const d = await res.json();
    return { windows: release(d?.windows), android: release(d?.android) };
  } catch {
    return { windows: null, android: null };
  }
}
