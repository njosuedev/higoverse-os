import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Product/shop images are base64 data URIs today (no CDN), so this
    // matters only if a real remote image URL is ever introduced.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },

  async redirects() {
    return [
      { source: "/SaleManagement",     destination: "/sales",     permanent: true },
      { source: "/ItemManagement",     destination: "/items",     permanent: true },
      { source: "/PartnerManagement",  destination: "/partners",  permanent: true },
      { source: "/PurchaseManagement", destination: "/purchases", permanent: true },
      { source: "/ExpenseManagement",  destination: "/expenses",  permanent: true },
      // Dashboard now lives at the root URL, not /dashboard.
      { source: "/dashboard",          destination: "/",          permanent: true },
      // A & T Consultants dropped the public marketplace — old shared links now
      // land on the dashboard instead of 404ing.
      { source: "/marketplace",         destination: "/", permanent: true },
      { source: "/marketplace/:shopId", destination: "/", permanent: true },
      { source: "/suppliers",           destination: "/", permanent: true },
      { source: "/shop/:shopId",        destination: "/", permanent: true },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/api/expenses/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_EXPENSES || "https://expenses-esys.vercel.app"}/:path*`,
      },
      {
        source: "/api/purchases/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_PURCHASES || "https://purchase-esys.vercel.app"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
