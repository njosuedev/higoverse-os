import type { Metadata } from "next";
import AuthGuard from "@/app/components/AuthGuard";

export const metadata: Metadata = {
  title: "Sales",
  description: "Record and track sales transactions, payment methods, and customer debts.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
