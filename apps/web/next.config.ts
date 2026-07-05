import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/SaleManagement",     destination: "/sales",     permanent: true },
      { source: "/ItemManagement",     destination: "/items",     permanent: true },
      { source: "/PartnerManagement",  destination: "/partners",  permanent: true },
      { source: "/PurchaseManagement", destination: "/purchases", permanent: true },
      { source: "/ExpenseManagement",  destination: "/expenses",  permanent: true },
      // Marketplace moved from the private dashboard shell to the public
      // site at "/" — keep old shared links working.
      { source: "/marketplace",           destination: "/",                permanent: true },
      { source: "/marketplace/:shopId",   destination: "/shop/:shopId",    permanent: true },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/api/expenses/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_EXPENSES || "http://localhost:8005"}/:path*`,
      },
      {
        source: "/api/purchases/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_PURCHASES || "https://higoverse-purchases.vercel.app"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
