"use client";

export default function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Hero */}
        <div className="animate-pulse">
          <div className="h-40 rounded-3xl bg-slate-200" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="bg-white rounded-2xl border border-slate-200 p-5"
            >
              <div className="animate-pulse">
                <div className="h-4 w-20 bg-slate-200 rounded" />
                <div className="h-8 w-16 bg-slate-300 rounded mt-3" />
                <div className="h-3 w-24 bg-slate-200 rounded mt-3" />
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <div className="h-6 w-40 bg-slate-200 rounded animate-pulse mb-4" />

          <div className="grid md:grid-cols-3 gap-4">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="bg-white rounded-2xl border border-slate-200 p-5"
              >
                <div className="animate-pulse">
                  <div className="w-12 h-12 rounded-xl bg-slate-200" />

                  <div className="h-5 w-32 bg-slate-300 rounded mt-4" />

                  <div className="h-3 w-full bg-slate-200 rounded mt-3" />

                  <div className="h-3 w-3/4 bg-slate-200 rounded mt-2" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Services */}
        <div className="mt-8">
          <div className="h-6 w-48 bg-slate-200 rounded animate-pulse mb-4" />

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div
                key={item}
                className="bg-white rounded-3xl border border-slate-200 p-6"
              >
                <div className="animate-pulse">
                  <div className="w-14 h-14 rounded-2xl bg-slate-200" />

                  <div className="h-5 w-32 bg-slate-300 rounded mt-5" />

                  <div className="h-3 w-full bg-slate-200 rounded mt-3" />

                  <div className="h-3 w-4/5 bg-slate-200 rounded mt-2" />

                  <div className="h-3 w-20 bg-slate-200 rounded mt-5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}