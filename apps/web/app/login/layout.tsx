import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Higoverse account to manage your shop.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="auth-page">{children}</div>;
}
