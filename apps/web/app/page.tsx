import Link from "next/link";

export const metadata = {
  title: "Higoverse | Business Operating System",
  description:
    "Higoverse is a modern business OS for inventory, sales, suppliers, customers, and analytics.",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col">
      {/* TOP NAV */}
      <header className="sticky top-0 z-50 backdrop-blur bg-white/80 border-b">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500" />
            <span className="font-semibold text-lg">Higoverse</span>
          </div>

          <nav className="hidden md:flex gap-8 text-sm text-zinc-600">
            <a>Features</a>
            <a>Solutions</a>
            <a>Pricing</a>
            <a>Docs</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl border border-zinc-300 hover:bg-zinc-100 text-sm"
            >
              Login
            </Link>

            <Link
              href="/register"
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight">
            Run Your Entire Business with
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500">
              {" "}
              Higoverse
            </span>
          </h1>

          <p className="mt-6 text-lg text-zinc-600 max-w-2xl mx-auto">
            A powerful business operating system for inventory, sales,
            suppliers, customers, and real-time analytics.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              Create Free Account
            </Link>

            <Link
              href="/login"
              className="px-6 py-3 rounded-xl border border-zinc-300 hover:bg-zinc-100"
            >
              Sign In
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-zinc-500">
        © {new Date().getFullYear()} Higoverse. All rights reserved.
      </footer>
    </div>
  );
}