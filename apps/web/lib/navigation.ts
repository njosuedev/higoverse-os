import {
LayoutDashboard,
Package,
Truck,
ShoppingCart,
Users,
BarChart3,
Settings,
} from "lucide-react";

export const SIDEBAR_LINKS = [
{
title: "Dashboard",
href: "/dashboard",
icon: LayoutDashboard,
},
{
title: "Products",
href: "/dashboard/products",
icon: Package,
},
{
title: "Suppliers",
href: "/dashboard/suppliers",
icon: Truck,
},
{
title: "Sales",
href: "/dashboard/sales",
icon: ShoppingCart,
},
{
title: "Customers",
href: "/dashboard/customers",
icon: Users,
},
{
title: "Reports",
href: "/dashboard/reports",
icon: BarChart3,
},
{
title: "Settings",
href: "/dashboard/settings",
icon: Settings,
},
];
