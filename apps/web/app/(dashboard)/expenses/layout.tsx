import type { Metadata } from "next";
import AuthGuard from "@/app/components/AuthGuard";

export const metadata: Metadata = {
  title: "Expenses",
  description: "Record and categorise business expenses to monitor costs and profitability.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
