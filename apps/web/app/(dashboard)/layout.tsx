import type { Metadata } from "next";
import HeartbeatManager from "@/app/components/dashboard/HeartbeatManager";
import ClientProviders from "@/app/components/dashboard/ClientProviders";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ClientProviders>
      <HeartbeatManager />
      {children}
    </ClientProviders>
  );
}
