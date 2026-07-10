import type { Metadata } from "next";
import { Phone, Mail, MapPin } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Higoverse team.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-2.5 py-5 sm:px-6 sm:py-12">
      <h1 className="text-xl font-bold text-slate-900 sm:text-3xl">Contact Us</h1>
      <p className="mt-2 text-sm text-slate-600 sm:mt-4 sm:text-lg">
        Have a question about buying, selling, or your Higoverse account? Reach out — we're happy to help.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:mt-8 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:rounded-2xl sm:p-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-500 sm:h-11 sm:w-11 sm:rounded-xl">
            <Phone size={17} className="sm:h-5 sm:w-5" />
          </div>
          <p className="mt-2.5 text-sm font-semibold text-slate-900 sm:mt-3">Phone</p>
          <a href="tel:+250790885174" className="text-xs text-slate-500 hover:text-orange-600 sm:text-sm">+250 790 885 174</a>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:rounded-2xl sm:p-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-500 sm:h-11 sm:w-11 sm:rounded-xl">
            <Mail size={17} className="sm:h-5 sm:w-5" />
          </div>
          <p className="mt-2.5 text-sm font-semibold text-slate-900 sm:mt-3">Email</p>
          <a href="mailto:support@higoverse.com" className="text-xs text-slate-500 hover:text-orange-600 sm:text-sm">support@higoverse.com</a>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:rounded-2xl sm:p-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-500 sm:h-11 sm:w-11 sm:rounded-xl">
            <MapPin size={17} className="sm:h-5 sm:w-5" />
          </div>
          <p className="mt-2.5 text-sm font-semibold text-slate-900 sm:mt-3">Location</p>
          <p className="text-xs text-slate-500 sm:text-sm">Kigali, Rwanda</p>
        </div>
      </div>
    </div>
  );
}
