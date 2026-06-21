"use client";

interface Props {
  /** number of stat pill cards under the banner */
  cards?: number;
  /** show a table-row skeleton block */
  showTable?: boolean;
  /** number of table rows */
  rows?: number;
  /** number of table columns */
  cols?: number;
  /** show a chart block instead of table */
  showChart?: boolean;
  /** show extra form-field blocks (settings page) */
  showForm?: boolean;
}

export default function PageSkeleton({
  cards = 4,
  showTable = true,
  rows = 6,
  cols = 5,
  showChart = false,
  showForm = false,
}: Props) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4 space-y-3">

        {/* Banner */}
        <div className="rounded-xl bg-[#1372e6] p-4 animate-pulse">
          <div className="flex justify-between items-center">
            <div className="space-y-1.5">
              <div className="h-3 w-36 bg-white/25 rounded" />
              <div className="h-2 w-24 bg-white/15 rounded" />
            </div>
            <div className="h-7 w-24 bg-white/20 rounded-lg" />
          </div>
          <div className="h-8 bg-white/10 rounded-lg mt-3" />
        </div>

        {/* Stat cards */}
        <div className={`grid gap-2.5 grid-cols-2 sm:grid-cols-${Math.min(cards, 4)} lg:grid-cols-${cards}`}>
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-3 animate-pulse">
              <div className="h-2 w-14 bg-slate-200 rounded mb-2" />
              <div className="h-5 w-16 bg-slate-200 rounded" />
              <div className="h-1.5 w-10 bg-slate-100 rounded mt-2" />
            </div>
          ))}
        </div>

        {/* Chart block */}
        {showChart && (
          <div className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse">
            <div className="h-2.5 w-28 bg-slate-200 rounded mb-4" />
            <div className="h-40 bg-slate-100 rounded-lg" />
          </div>
        )}

        {/* Form fields (settings) */}
        {showForm && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse space-y-2.5">
                <div className="h-2.5 w-28 bg-slate-200 rounded" />
                <div className="h-8 bg-slate-100 rounded-lg" />
                <div className="h-8 bg-slate-100 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {showTable && (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            {/* Table header */}
            <div className={`grid px-4 py-2.5 gap-4 border-b border-slate-100 animate-pulse`}
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: cols }).map((_, i) => (
                <div key={i} className="h-2 bg-slate-200 rounded" />
              ))}
            </div>
            {/* Table rows */}
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i}
                className="grid px-4 py-3 gap-4 border-b border-slate-50 animate-pulse"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {Array.from({ length: cols }).map((_, j) => (
                  <div key={j} className={`h-2.5 rounded ${j === 0 ? "bg-slate-200" : "bg-slate-100"}`} />
                ))}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
