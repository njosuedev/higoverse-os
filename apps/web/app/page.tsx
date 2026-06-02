import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">

      {/* NAV */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Image src="/next.svg" alt="logo" width={90} height={20} className="invert" />
          <span className="text-sm text-zinc-400">Business OS</span>
        </div>

        <nav className="hidden md:flex gap-6 text-sm text-zinc-400">
          <a className="hover:text-white">Dashboard</a>
          <a className="hover:text-white">Inventory</a>
          <a className="hover:text-white">Sales</a>
          <a className="hover:text-white">Reports</a>
        </nav>

        <button className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200">
          Get Started
        </button>
      </header>

      {/* HERO */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-4xl md:text-6xl font-bold leading-tight">
          Manage Your Business
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            In One System
          </span>
        </h1>

        <p className="mt-6 text-zinc-400 max-w-2xl text-lg">
          A complete business operations platform for inventory, suppliers, purchases,
          sales, customers, and real-time analytics.
        </p>

        {/* CTA */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <button className="px-6 py-3 rounded-lg bg-white text-black font-medium hover:bg-zinc-200">
            Open Dashboard
          </button>

          <button className="px-6 py-3 rounded-lg border border-zinc-700 text-white hover:bg-zinc-900">
            View Reports
          </button>
        </div>

        {/* FEATURES */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800">
            <h3 className="font-semibold text-lg">Inventory Control</h3>
            <p className="text-sm text-zinc-400 mt-2">
              Track stock levels, products, and warehouse movement in real time.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800">
            <h3 className="font-semibold text-lg">Sales & Customers</h3>
            <p className="text-sm text-zinc-400 mt-2">
              Manage invoices, customers, and sales performance easily.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800">
            <h3 className="font-semibold text-lg">Analytics</h3>
            <p className="text-sm text-zinc-400 mt-2">
              Profit, loss, expenses, and performance dashboards in one place.
            </p>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="text-center py-6 text-xs text-zinc-500 border-t border-zinc-800">
        © {new Date().getFullYear()} Business OS — Built for scalable operations
      </footer>
    </div>
  );
}