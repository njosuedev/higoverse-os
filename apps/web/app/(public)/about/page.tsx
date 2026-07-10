import type { Metadata } from "next";
import { ShieldCheck, Store, Users, TrendingUp } from "lucide-react";

export const metadata: Metadata = {
  title: "About Higoverse",
  description: "Higoverse is a business technology platform combining inventory management software with a public B2B marketplace for shops across Rwanda and Africa.",
};

const POINTS = [
  { icon: Store, title: "A marketplace for real businesses", body: "Every shop on Higoverse is reviewed and approved by our team before it goes live, so buyers can browse with confidence." },
  { icon: ShieldCheck, title: "Verified suppliers", body: "Shops apply with real business details (including tax ID) before they can list products publicly." },
  { icon: TrendingUp, title: "Built for growth", body: "Behind every shop is a full inventory, sales, and reporting system that helps businesses run day-to-day operations." },
  { icon: Users, title: "For Rwanda and Africa", body: "Higoverse is built for the realities of doing business locally — simple, fast, and mobile-friendly." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-2.5 py-5 sm:px-6 sm:py-12">
      <h1 className="text-xl font-bold text-slate-900 sm:text-3xl">About Higoverse</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:mt-4 sm:text-lg">
        Higoverse is a business technology platform for Rwanda and Africa — combining a modern inventory management
        system for shop owners with a public marketplace where anyone can discover products and suppliers.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-6">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:rounded-2xl sm:p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-500 sm:h-11 sm:w-11 sm:rounded-xl">
              <p.icon size={17} className="sm:h-5 sm:w-5" />
            </div>
            <h2 className="mt-2.5 text-sm font-semibold text-slate-900 sm:mt-3 sm:text-base">{p.title}</h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{p.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
