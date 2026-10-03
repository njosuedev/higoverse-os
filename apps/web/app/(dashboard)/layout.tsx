import type { Metadata } from "next";
import AuthGuard from "@/app/components/AuthGuard";
import HeartbeatManager from "@/app/components/dashboard/HeartbeatManager";
import ClientProviders from "@/app/components/dashboard/ClientProviders";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Everything under this route group is the private business dashboard —
// AuthGuard lives here (not the root layout). Phones are supported.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ClientProviders>
        <HeartbeatManager />
        <DashboardHeader />
        {children}
      </ClientProviders>
    </AuthGuard>
  );
}
