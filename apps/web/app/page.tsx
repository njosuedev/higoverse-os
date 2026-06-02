export const metadata = {
  title: "Higoverse | Business Operating System",
  description:
    "Higoverse is a modern business operating system for inventory, sales, suppliers, customers, and analytics.",
  openGraph: {
    title: "Higoverse | Business OS",
    description: "Manage your entire business in one system.",
    type: "website",
  },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col">

      {/* NAVBAR */}
      <header className="flex items-center justify-between px-8 py-5 border-b bg-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600" />
          <span className="text-lg font-semibold">Higoverse</span>
          <span className="text-xs text-zinc-500">Business OS</span>
        </div>

        <nav className="hidden md:flex gap-6 text-sm text-zinc-600">
          <a className="hover:text-zinc-900">Dashboard</a>
          <a className="hover:text-zinc-900">Inventory</a>
          <a className="hover:text-zinc-900">Sales</a>
          <a className="hover:text-zinc-900">Reports</a>
        </nav>

        <button className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm hover:bg-zinc-800">
          Open App
        </button>
      </header>

      {/* HERO */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6">

        <h1 className="text-4xl md:text-6xl font-bold leading-tight">
          Higoverse Business Operating System
        </h1>

        <h2 className="mt-4 text-lg text-zinc-600 max-w-2xl">
          Inventory • Sales • Suppliers • Customers • Analytics
        </h2>

        <p className="mt-6 text-zinc-500 max-w-2xl text-lg">
          A complete business platform to manage operations, track performance,
          and scale your business efficiently.
        </p>

        {/* CTA */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <button className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">
            Enter Dashboard
          </button>

          <button className="px-6 py-3 rounded-lg border border-zinc-300 text-zinc-800 hover:bg-zinc-100">
            Explore Features
          </button>
        </div>

        {/* FEATURES */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">

          <div className="p-6 rounded-xl border bg-white shadow-sm">
            <h3 className="text-lg font-semibold">Smart Inventory</h3>
            <p className="text-sm text-zinc-600 mt-2">
              Track stock, automate alerts, and manage products easily.
            </p>
          </div>

          <div className="p-6 rounded-xl border bg-white shadow-sm">
            <h3 className="text-lg font-semibold">Sales & Finance</h3>
            <p className="text-sm text-zinc-600 mt-2">
              Manage invoices, expenses, profit, and daily sales.
            </p>
          </div>

          <div className="p-6 rounded-xl border bg-white shadow-sm">
            <h3 className="text-lg font-semibold">Business Network</h3>
            <p className="text-sm text-zinc-600 mt-2">
              Connect suppliers, customers, and partners in one ecosystem.
            </p>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="text-center py-6 text-xs text-zinc-500 border-t">
        © {new Date().getFullYear()} Higoverse — Business Operating System
      </footer>
    </div>
  );
}