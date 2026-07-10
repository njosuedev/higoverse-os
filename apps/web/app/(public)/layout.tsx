import type { Metadata } from "next";
import { ShopProvider } from "@/lib/shop-context";
import PublicHeader from "@/app/components/public/PublicHeader";
import PublicFooter from "@/app/components/public/PublicFooter";
import MobileTabBar from "@/app/components/public/MobileTabBar";

// Public marketplace — no AuthGuard/DeviceGuard here. Anyone (including
// search-engine crawlers and phone browsers) can view everything under this
// route group; only specific actions redirect to /login.
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopProvider>
      <div className="flex min-h-screen flex-col bg-white">
        <PublicHeader />
        <main className="flex-1 pb-14 lg:pb-0">{children}</main>
        {/* App-style bottom tab bar replaces the full footer on mobile */}
        <div className="hidden lg:block">
          <PublicFooter />
        </div>
        <MobileTabBar />
      </div>
    </ShopProvider>
  );
}
