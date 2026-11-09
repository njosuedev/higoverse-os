import type { Metadata } from "next";
import AuthGuard from "@/app/components/AuthGuard";
import OwnerOnly from "@/app/components/OwnerOnly";

export const metadata: Metadata = {
  title: "Income",
  description: "Record money the business earns outside its sales: rentals, services, commissions and more.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Same people as Expenses (expense-service EXPENSE_ROLES).
  return <AuthGuard><OwnerOnly expenses>{children}</OwnerOnly></AuthGuard>;
}
