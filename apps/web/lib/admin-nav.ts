import { LayoutDashboard, Store, Users, History, KeyRound } from "lucide-react";

// The platform admin's sections. The admin manages companies and the people
// in them — never a company's own sales, stock or money — so these are the
// only pages an admin sees (the shop pages redirect to /admin).
export const ADMIN_TABS = [
  { key: "overview", label: "admin.tab_overview", icon: LayoutDashboard },
  { key: "shops",    label: "admin.tab_shops",    icon: Store },
  { key: "users",    label: "admin.tab_users",    icon: Users },
  { key: "activity", label: "admin.tab_activity", icon: History },
  { key: "account",  label: "admin.tab_account",  icon: KeyRound },
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number]["key"];

export function toAdminTab(v: string | null | undefined): AdminTab {
  return ADMIN_TABS.some((t) => t.key === v) ? (v as AdminTab) : "overview";
}

export function adminTabHref(tab: AdminTab): string {
  return tab === "overview" ? "/admin" : `/admin?tab=${tab}`;
}

/** The only routes an admin may open; everything else goes to /admin. */
export function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
