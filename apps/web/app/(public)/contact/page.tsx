import type { Metadata } from "next";
import { Phone, Mail, MapPin } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Higoverse team.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-slate-900">Contact Us</h1>
      <p className="mt-4 text-lg text-slate-600">
        Have a question about buying, selling, or your Higoverse account? Reach out — we're happy to help.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
            <Phone size={20} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900">Phone</p>
          <a href="tel:+250790885174" className="text-sm text-slate-500 hover:text-orange-600">+250 790 885 174</a>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
            <Mail size={20} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900">Email</p>
          <a href="mailto:support@higoverse.com" className="text-sm text-slate-500 hover:text-orange-600">support@higoverse.com</a>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
            <MapPin size={20} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900">Location</p>
          <p className="text-sm text-slate-500">Kigali, Rwanda</p>
        </div>
      </div>
    </div>
  );
}
