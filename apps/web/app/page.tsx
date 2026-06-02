export const metadata = {
  title: "Higoverse | Business Operating System",
  description:
    "Higoverse is a modern business operating system for inventory, sales, suppliers, customers, and analytics. Built for scalable African businesses.",
  keywords: [
    "Higoverse",
    "business OS",
    "ERP Rwanda",
    "inventory system",
    "sales management",
    "business software Africa",
    "shop management system",
    "SaaS business platform",
  ],
  authors: [{ name: "Higoverse" }],
  creator: "Higoverse",
  openGraph: {
    title: "Higoverse | Business Operating System",
    description:
      "Manage inventory, sales, suppliers, customers, and analytics in one powerful platform.",
    url: "https://higoverse.com",
    siteName: "Higoverse",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Higoverse | Business OS",
    description:
      "Modern business operating system for growing businesses.",
  },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">

      {/* NAVBAR */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600" />
          <span className="text-lg font-semibold">Higoverse</span>
          <span className="text-xs text-zinc-500">Business OS</span>
        </div>

        <nav className="hidden md:flex gap-6 text-sm text-zinc-400">
          <a className="hover:text-white">Dashboard</a>
          <a className="hover:text-white">Inventory</a>
          <a className="hover:text-white">Sales</a>
          <a className="hover:text-white">Reports</a>
        </nav>

        <button className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition">
          Open App
        </button>
      </header>

      {/* HERO SECTION */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6">

        <h1 className="text-4xl md:text-6xl font-bold leading-tight">
          Higoverse Business Operating System
        </h1>

        <h2 className="mt-4 text-xl text-zinc-400 max-w-2xl">
          Inventory • Sales • Suppliers • Customers • Analytics
        </h2>

        <p className="mt-6 text-zinc-400 max-w-2xl text-lg">
          A complete SaaS platform to manage your entire business in real time.
          Built for modern enterprises and fast-growing African businesses.
        </p>

        {/* CTA */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <button className="px-6 py-3 rounded-lg bg-white text-black font-medium hover:bg-zinc-200">
            Enter Dashboard
          </button>
          <button className="px-6 py-3 rounded-lg border border-zinc-700 text-white hover:bg-zinc-900">
            Explore Features
          </button>
        </div>

        {/* FEATURES */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">

          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 text-left">
            <h3 className="text-lg font-semibold">Smart Inventory</h3>
            <p className="text-sm text-zinc-400 mt-2">
              Track stock levels, automate alerts, and manage products across multiple shops.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 text-left">
            <h3 className="text-lg font-semibold">Sales & Finance</h3>
            <p className="text-sm text-zinc-400 mt-2">
              Monitor sales, expenses, invoices, and profit/loss in real time.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 text-left">
            <h3 className="text-lg font-semibold">Business Network</h3>
            <p className="text-sm text-zinc-400 mt-2">
              Connect suppliers, customers, and partners in one ecosystem.
            </p>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="text-center py-6 text-xs text-zinc-500 border-t border-zinc-800">
        © {new Date().getFullYear()} Higoverse — Business Operating System
      </footer>

      {/* STRUCTURED DATA (SEO BOOST) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Higoverse",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description:
              "Business operating system for inventory, sales, suppliers, customers, and analytics.",
            offers: {
              "@type": "Offer",
              price: "0",
            },
          }),
        }}
      />
    </div>
  );
}