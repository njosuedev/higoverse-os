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
            <a className="hover:text-zinc-900">Features</a>
            <a className="hover:text-zinc-900">Solutions</a>
            <a className="hover:text-zinc-900">Pricing</a>
            <a className="hover:text-zinc-900">Docs</a>
          </nav>

          <button className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm hover:bg-zinc-800">
            Open App
          </button>
        </div>
      </header>

      {/* HERO */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">

          <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight">
            Run Your Entire Business with
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500">
              {" "}Higoverse
            </span>
          </h1>

          <p className="mt-6 text-lg text-zinc-600 max-w-2xl mx-auto">
            A powerful business operating system for inventory, sales, suppliers,
            customers, and real-time analytics — built for scalable companies.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700">
              Get Started
            </button>

            <button className="px-6 py-3 rounded-xl border border-zinc-300 hover:bg-zinc-100">
              View Dashboard
            </button>
          </div>

          {/* TRUST BADGES */}
          <div className="mt-10 text-sm text-zinc-500">
            Trusted for modern business operations & inventory systems
          </div>
        </section>

        {/* FEATURES */}
        <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6">

          <div className="p-6 rounded-2xl border bg-white shadow-sm hover:shadow-md transition">
            <h3 className="font-semibold text-lg">Inventory System</h3>
            <p className="text-zinc-600 mt-2 text-sm">
              Track stock, manage products, and automate inventory alerts in real time.
            </p>
          </div>

          <div className="p-6 rounded-2xl border bg-white shadow-sm hover:shadow-md transition">
            <h3 className="font-semibold text-lg">Sales & Finance</h3>
            <p className="text-zinc-600 mt-2 text-sm">
              Manage invoices, sales, expenses, and profit/loss reporting.
            </p>
          </div>

          <div className="p-6 rounded-2xl border bg-white shadow-sm hover:shadow-md transition">
            <h3 className="font-semibold text-lg">Business Network</h3>
            <p className="text-zinc-600 mt-2 text-sm">
              Connect suppliers, customers, and partners in one ecosystem.
            </p>
          </div>
        </section>

        {/* DASHBOARD PREVIEW BLOCK */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="rounded-3xl border bg-zinc-50 p-10 text-center">
            <h2 className="text-2xl font-semibold">
              Built for Real Business Operations
            </h2>
            <p className="text-zinc-600 mt-3 max-w-xl mx-auto">
              From small shops to enterprise systems — Higoverse scales with your business.
            </p>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t py-8 text-center text-sm text-zinc-500">
        © {new Date().getFullYear()} Higoverse. All rights reserved.
      </footer>
    </div>
  );
}