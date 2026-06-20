import type { Metadata } from "next";
import HeartbeatManager from "@/app/components/dashboard/HeartbeatManager";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeartbeatManager />
      {children}
    </>
  );
}
