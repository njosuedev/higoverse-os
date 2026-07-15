import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create an A & T Consultants account to start managing your shop and business operations.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="auth-page">{children}</div>;
}
