import type { Metadata, Viewport } from "next";
import AuthGuard from "@/app/components/AuthGuard";
import HeartbeatManager from "@/app/components/dashboard/HeartbeatManager";
import ClientProviders from "@/app/components/dashboard/ClientProviders";
import DashboardHeader from "@/app/components/dashboard/DashboardHeader";
import TableCards from "@/app/components/dashboard/TableCards";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Edge to edge on phones, like the app: the page runs under the notch and
// the gesture bar, and the header and tab bar pad themselves by the
// phone's safe-area insets (env(safe-area-inset-*) only report them with
// viewport-fit=cover). Merged into the root layout's viewport.
export const viewport: Viewport = { viewportFit: "cover" };

// Everything under this route group is the private business dashboard —
// AuthGuard lives here (not the root layout). Phones are supported.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ClientProviders>
        <HeartbeatManager />
        <TableCards />
        <DashboardHeader />
        {children}
      </ClientProviders>
    </AuthGuard>
  );
}
