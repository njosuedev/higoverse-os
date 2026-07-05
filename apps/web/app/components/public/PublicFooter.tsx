import Link from "next/link";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Marketplace",
    links: [
      { label: "All Products", href: "/products" },
      { label: "Categories", href: "/categories" },
      { label: "Suppliers", href: "/suppliers" },
      { label: "Search", href: "/search" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Higoverse", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "For Business",
    links: [
      { label: "Create a Shop", href: "/register" },
      { label: "Business Login", href: "/login" },
    ],
  },
];

export default function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-slate-600 transition hover:text-orange-600">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 border-t border-slate-100 pt-6 text-xs text-slate-400">
          © 2020–{new Date().getFullYear()} Higoverse. Business Technology Company.
        </div>
      </div>
    </footer>
  );
}
