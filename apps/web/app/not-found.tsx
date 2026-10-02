import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-5xl font-bold text-slate-900">
          404
        </h1>

        <h2 className="mt-4 text-xl font-semibold text-slate-700">
          Page Not Found
        </h2>

        <p className="mt-3 text-slate-500">
          The page you are looking for doesn’t exist.
        </p>

        <Link
          href="/"
          className="inline-block mt-6 px-5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
