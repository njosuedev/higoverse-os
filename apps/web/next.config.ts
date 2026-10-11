import { execSync } from "node:child_process";
import path from "node:path";
import type { NextConfig } from "next";

// The repo root has its own (empty) package-lock.json, which makes Next.js
// guess the root as the project folder. This app is self-contained here.
const appRoot = path.resolve(__dirname);

// One id per deployed version: the commit being built (the VPS builds from
// its git checkout). It names the build (.next/BUILD_ID, served by
// /api/version), is baked into the page as NEXT_PUBLIC_BUILD_ID so an open
// tab knows which version it runs, and is Next.js's deploymentId: a tab
// still on the old version navigates with a full page load instead of
// fetching code files the new build no longer has ("This page couldn't
// load"). The same for every build worker, so never time-based.
function buildId(): string {
  if (process.env.NEXT_DEPLOYMENT_ID) return process.env.NEXT_DEPLOYMENT_ID;
  try {
    return execSync("git rev-parse --short=12 HEAD", { cwd: appRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "local";
  }
}
const BUILD_ID = buildId();

const nextConfig: NextConfig = {
  turbopack: { root: appRoot },
  outputFileTracingRoot: appRoot,

  generateBuildId: async () => BUILD_ID,
  deploymentId: BUILD_ID,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },

  images: {
    // Product/shop images are base64 data URIs today (no CDN), so this
    // matters only if a real remote image URL is ever introduced.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },

  async redirects() {
    return [
      // One address for the whole site: www.higoverse.com moves to
      // higoverse.com (permanently, so search engines keep only one).
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.higoverse.com" }],
        destination: "https://higoverse.com/:path*",
        permanent: true,
      },
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
    return {
      // higoverse.com/ is two pages in one: the dashboard for people signed
      // in on this browser, the public home page (app/welcome) for everyone
      // else, search engines included. Sign-in lives in the browser, so a
      // yes/no cookie set at sign-in (lib/auth.ts SIGNED_IN_COOKIE) decides.
      beforeFiles: [
        { source: "/", missing: [{ type: "cookie", key: "hgv_signed_in", value: "1" }], destination: "/welcome" },
      ],
      afterFiles: [
      ...services.map(([name, port]) => ({ source: `/svc/${name}/:path*`, destination: `${target(name, port)}/:path*` })),
      {
        source: "/api/expenses/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_EXPENSES || target("expenses", 8005)}/:path*`,
      },
      {
        source: "/api/purchases/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_PURCHASES || target("purchases", 8004)}/:path*`,
      },
      ],
    };
  },
};

export default nextConfig;
