"use client";

import { Bone, SkeletonRegion } from "@/app/components/ui/Skeleton";

/**
 * Home while it loads: the same sections, in the same places and sizes, as
 * the page that replaces it (app/(dashboard)/page.tsx), so nothing jumps when
 * the figures arrive. What shows depends on the business, as on the page:
 * car dealers get the "last 3 days" band and the car watch; money panels only
 * for those who see money; the margin card only where profit is shown.
 */
export default function HomeSkeleton({ isCar, fin, prof }: { isCar: boolean; fin: boolean; prof: boolean }) {
  const figures = fin ? 6 : 5;
  return (
    <div className="min-h-screen">
      <SkeletonRegion className="max-w-7xl mx-auto px-3 sm:px-5 py-2.5 sm:py-3">
        <div className="space-y-4">
          {isCar ? (
            <>
              {/* Stories + "last 3 days" */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
                <div className="min-w-0 shrink-0 lg:max-w-[58%]"><StoryRow /></div>
                <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-white p-3">
                  <Bone className="mb-3 ml-1 h-2.5 w-24" />
                  <div className="grid flex-1 grid-cols-3 gap-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex min-h-[96px] flex-col rounded-lg border border-border p-2.5 sm:p-3">
                        <Bone className="h-8 w-8 rounded-full" />
                        <Bone className="mt-3 h-6 w-8" />
                        <Bone className="mt-1.5 h-2.5 w-16" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${fin ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
                {Array.from({ length: figures }, (_, i) => <Figure key={i} />)}
              </div>
              {/* Car watch: pending, fines, missing details */}
              <div className="grid gap-3 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Panel key={i} titleWidth={[120, 104, 136][i]}>
                    <div className="space-y-2 px-3.5 pb-3.5">
                      {[0, 1, 2].map((j) => <Bone key={j} className="h-11 rounded-press" />)}
                    </div>
                  </Panel>
                ))}
              </div>
            </>
          ) : (
            /* Stories sharing one band with the key figures */
            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
              <div className="min-w-0 shrink-0 lg:max-w-[58%]"><StoryRow /></div>
              <div className="grid min-w-0 flex-1 grid-cols-2 content-center gap-2 sm:grid-cols-3 lg:grid-cols-3">
                {Array.from({ length: figures }, (_, i) => <Figure key={i} />)}
              </div>
            </div>
          )}

          <div className="hgv-notch-divider" aria-hidden="true" />

          {/* The week: revenue, purchases, expenses, profit */}
          {fin && (
            <div className="rounded-data border border-border bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <Bone className="h-3.5 w-44" />
                <Bone className="h-2.5 w-16" />
              </div>
              <div className={`grid grid-cols-2 ${isCar ? "" : "sm:grid-cols-4"} divide-y divide-border overflow-hidden rounded-data border border-border sm:divide-x sm:divide-y-0`}>
                {Array.from({ length: isCar ? 2 : prof ? 4 : 3 }, (_, i) => (
                  <div key={i} className="space-y-1.5 p-3">
                    <Bone className="h-2.5 w-20" />
                    <Bone className="h-5 w-28" />
                    <Bone className="h-2.5 w-14" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stock health, margin, shops online */}
          <div className={`grid grid-cols-1 gap-3 ${prof ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {Array.from({ length: prof ? 3 : 2 }, (_, i) => (
              <div key={i} className="rounded-data border border-border bg-white p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <Bone className="h-2.5 w-24" />
                  <Bone className="h-2.5 w-8" />
                </div>
                <Bone className="mb-2.5 h-1.5 rounded-full" />
                <div className="flex justify-between">
                  <Bone className="h-2.5 w-20" />
                  <Bone className="h-2.5 w-12" />
                </div>
              </div>
            ))}
          </div>

          {/* Seven days + recent sales */}
          <div className="grid gap-3 md:grid-cols-5">
            {fin && (
              <div className="rounded-data border border-border bg-white p-3.5 md:col-span-3">
                <div className="mb-3 flex items-start justify-between">
                  <div className="space-y-1.5">
                    <Bone className="h-3.5 w-36" />
                    <Bone className="h-2.5 w-24" />
                  </div>
                  <Bone className="h-2.5 w-16" />
                </div>
                <Chart />
                <div className="mt-2 flex gap-3">
                  <Bone className="h-2.5 w-16" />
                  <Bone className="h-2.5 w-14" />
                </div>
              </div>
            )}
            <div className={`${fin ? "md:col-span-2" : "md:col-span-5"} overflow-hidden rounded-data border border-border bg-white`}>
              <Header titleWidth={112} />
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-2.5 border-t border-border px-3.5 py-2.5">
                  <Bone className="h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Bone className="h-3" style={{ width: `${[64, 48, 72, 56, 44][i]}%` }} />
                    <Bone className="h-2.5 w-20" />
                  </div>
                  <Bone className="h-3 w-16 shrink-0" />
                </div>
              ))}
              <div className="border-t border-border px-3.5 py-2.5"><Bone className="h-7 rounded-press" /></div>
            </div>
          </div>

          {/* Stock alerts + quick actions */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="overflow-hidden rounded-data border border-border bg-white">
              <Header titleWidth={104} />
              <div className="flex items-center px-3.5 pt-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={`shrink-0 rounded-full border-2 border-border bg-white p-0.5 ${i > 0 ? "-ml-3" : ""}`}><Bone className="h-11 w-11 rounded-full" /></span>
                ))}
              </div>
              <div className="flex items-center gap-2.5 px-3.5 pb-4 pt-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Bone className="h-3 w-32" />
                  <Bone className="h-2.5 w-24" />
                </div>
                <Bone className="h-7 w-20 rounded-full" />
              </div>
            </div>
            <div className="rounded-data border border-border bg-white p-3.5">
              <Bone className="mb-3 h-3.5 w-28" />
              <Bone className="mb-2 h-[58px] rounded-press" />
              <div className="overflow-hidden rounded-data border border-border">
                {Array.from({ length: isCar ? 2 : 3 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                    <Bone className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Bone className="h-3 w-28" />
                      <Bone className="h-2.5 w-44 max-w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="overflow-hidden rounded-data border border-border bg-white">
            <Bone className="mx-3.5 mb-2 mt-3.5 h-3.5 w-24" />
            <div className="grid sm:grid-cols-2">
              {Array.from({ length: isCar ? 7 : 8 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border px-3.5 py-2.5">
                  <Bone className="h-4 w-4 shrink-0" />
                  <Bone className="h-3" style={{ width: [96, 120, 80, 104, 88, 112, 72, 100][i] }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </SkeletonRegion>
    </div>
  );
}

/** Story cards, as tall as the real ones (the row scrolls, so it never squeezes). */
function StoryRow() {
  return (
    <div className="flex gap-2 overflow-hidden pb-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="relative h-[220px] w-[124px] flex-none overflow-hidden rounded-xl">
          <Bone className="absolute inset-0 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** A key figure card (StatCard size "sm"): label and icon, then the value. */
function Figure() {
  return (
    <div className="flex h-full flex-col justify-between rounded-data border border-border bg-white px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <Bone className="h-2.5 w-16" />
        <Bone className="h-4 w-4" />
      </div>
      <Bone className="mt-2 h-5 w-14" />
    </div>
  );
}

/** A section heading and its "view all" link. */
function Header({ titleWidth }: { titleWidth: number }) {
  return (
    <div className="flex items-center justify-between px-3.5 pb-2.5 pt-3.5">
      <Bone className="h-3.5" style={{ width: titleWidth }} />
      <Bone className="h-2.5 w-14" />
    </div>
  );
}

function Panel({ titleWidth, children }: { titleWidth: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-data border border-border bg-white">
      <Header titleWidth={titleWidth} />
      {children}
    </div>
  );
}

/** The seven-day chart: its plot area over the day labels. */
function Chart() {
  return (
    <div>
      <Bone className="h-[104px] rounded-press" />
      <div className="mt-1.5 flex justify-between px-1">
        {Array.from({ length: 7 }, (_, i) => <Bone key={i} className="h-2 w-6" />)}
      </div>
    </div>
  );
}
