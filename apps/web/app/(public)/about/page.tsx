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
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-slate-900">About Higoverse</h1>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">
        Higoverse is a business technology platform for Rwanda and Africa — combining a modern inventory management
        system for shop owners with a public marketplace where anyone can discover products and suppliers.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
              <p.icon size={20} />
            </div>
            <h2 className="mt-3 text-base font-semibold text-slate-900">{p.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{p.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
