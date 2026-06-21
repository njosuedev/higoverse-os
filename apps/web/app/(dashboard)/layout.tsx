import type { Metadata } from "next";
import HeartbeatManager from "@/app/components/dashboard/HeartbeatManager";
import ClientProviders from "@/app/components/dashboard/ClientProviders";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ClientProviders>
      <HeartbeatManager />
      <DashboardHeader />
      {children}
    </ClientProviders>
  );
}
