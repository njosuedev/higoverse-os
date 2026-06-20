import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a Higoverse account to start managing your shop and business operations.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
