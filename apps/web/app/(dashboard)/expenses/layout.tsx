import type { Metadata } from "next";
import AuthGuard from "@/app/components/AuthGuard";
import OwnerOnly from "@/app/components/OwnerOnly";

export const metadata: Metadata = {
  title: "Expenses",
  description: "Record and categorise business expenses to monitor costs and profitability.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Owners, admins and (at a car company) managers: see expense-service's EXPENSE_ROLES.
  return <AuthGuard><OwnerOnly expenses>{children}</OwnerOnly></AuthGuard>;
}
