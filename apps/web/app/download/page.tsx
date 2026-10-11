import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { latestReleases } from "@/lib/app-releases";
import DownloadView from "./DownloadView";

export const metadata: Metadata = {
  title: "Download the apps",
  description: "Higoverse for Windows and Android: the same account on your computer and your phone.",
  alternates: { canonical: `${SITE.url}/download` },
};

// The versions are read again at most every five minutes.
export const revalidate = 300;

/** Public page with the latest Windows and Android apps, and what to do when
 *  Windows or Android warns about an app from outside their stores. */
export default async function DownloadPage() {
  return <DownloadView releases={await latestReleases()} />;
}
