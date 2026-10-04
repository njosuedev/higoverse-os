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
      // Higoverse dropped the public marketplace — old shared links now
      // land on the dashboard instead of 404ing.
      { source: "/marketplace",         destination: "/", permanent: true },
      { source: "/marketplace/:shopId", destination: "/", permanent: true },
      { source: "/suppliers",           destination: "/", permanent: true },
      { source: "/shop/:shopId",        destination: "/", permanent: true },
    ];
  },

  async rewrites() {
    // Same-origin service paths. On the VPS nginx answers /svc/* before
    // requests ever reach Next.js; in local development these rewrites play
    // the same role and forward to the services on their usual ports.
    //
    // HGV_API_ORIGIN (e.g. https://higoverse.com/svc, set in
    // .env.development.local) sends them to a deployed server instead, for
    // working on the frontend without running the services. That is live
    // data: anything changed while testing changes it for real.
    const remote = process.env.HGV_API_ORIGIN?.replace(/\/+$/, "");
    const local = (port: number) => `http://127.0.0.1:${port}`;
    const services: [string, number][] = [
      ["auth", 8000], ["products", 8001], ["suppliers", 8002], ["sales", 8003], ["purchases", 8004],
      ["expenses", 8005], ["settings", 8006], ["shops", 8007], ["reports", 8008],
    ];
    const target = (name: string, port: number) => (remote ? `${remote}/${name}` : local(port));
    return [
      ...services.map(([name, port]) => ({ source: `/svc/${name}/:path*`, destination: `${target(name, port)}/:path*` })),
      {
        source: "/api/expenses/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_EXPENSES || target("expenses", 8005)}/:path*`,
      },
      {
        source: "/api/purchases/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_PURCHASES || target("purchases", 8004)}/:path*`,
      },
    ];
  },
};

export default nextConfig;
