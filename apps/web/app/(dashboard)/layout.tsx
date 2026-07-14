import type { Metadata } from "next";
import AuthGuard from "@/app/components/AuthGuard";
import DeviceGuard from "@/app/components/DeviceGuard";
import HeartbeatManager from "@/app/components/dashboard/HeartbeatManager";
import ClientProviders from "@/app/components/dashboard/ClientProviders";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import ShopGuard from "@/app/components/dashboard/ShopGuard";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Everything under this route group is the private business dashboard —
// AuthGuard/DeviceGuard live here (not the root layout).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DeviceGuard>
        <ClientProviders>
          <HeartbeatManager />
          <DashboardHeader />
          <ShopGuard>
            {children}
          </ShopGuard>
        </ClientProviders>
      </DeviceGuard>
    </AuthGuard>
  );
}
