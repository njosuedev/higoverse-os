import Link from "next/link";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "For Buyers",
    links: [
      { label: "All Products", href: "/products" },
      { label: "Categories", href: "/categories" },
      { label: "Verified Suppliers", href: "/suppliers" },
      { label: "Search", href: "/search" },
    ],
  },
  {
    title: "For Suppliers",
    links: [
      { label: "Create a Shop", href: "/register" },
      { label: "List a Product", href: "/items" },
      { label: "Business Login", href: "/login" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Higoverse", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export default function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2">
              <img src="/higoverse.png" alt="Higoverse" className="h-8 w-8 rounded-xl object-cover" />
              <span className="text-base font-bold tracking-tight text-slate-900">Higoverse</span>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              A modern B2B marketplace connecting businesses across Rwanda and Africa.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-slate-600 transition hover:text-orange-600 hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-slate-200 pt-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2020–{new Date().getFullYear()} Higoverse. Business Technology Company.</span>
          <span>🇷🇼 Rwanda · RWF</span>
        </div>
      </div>
    </footer>
  );
}
