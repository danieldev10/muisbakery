import type { AppRole } from "@/lib/roles";

export type NavItem = {
  label: string;
  /** When omitted the item renders as a disabled placeholder (future phase). */
  href?: string;
};

export const roleNav: Record<AppRole, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard", href: "/admin/dashboard" },
    { label: "Users", href: "/admin/users" },
    { label: "Raw materials", href: "/admin/raw-materials" },
    { label: "Products", href: "/admin/products" },
    { label: "Suppliers", href: "/admin/suppliers" },
    { label: "Recipes", href: "/admin/recipes" },
    { label: "Settings", href: "/admin/settings" },
  ],
  STORE: [
    { label: "Dashboard", href: "/store/dashboard" },
    { label: "Inventory", href: "/store/inventory" },
    { label: "Receive materials", href: "/store/receiving" },
    { label: "Material requests", href: "/store/requests" },
  ],
  PRODUCTION: [
    { label: "Dashboard", href: "/production/dashboard" },
    { label: "Material requests", href: "/production/requests" },
    { label: "Inventory", href: "/production/inventory" },
    { label: "Output", href: "/production/output" },
    { label: "Runs", href: "/production/runs" },
    { label: "Waste", href: "/production/waste" },
  ],
  SALES: [
    { label: "Dashboard", href: "/sales/dashboard" },
    { label: "Point of sale", href: "/sales/pos" },
    { label: "Inventory", href: "/sales/inventory" },
    { label: "Daily summary", href: "/sales/daily-summary" },
    { label: "Returns", href: "/sales/returns" },
  ],
  MANAGEMENT: [
    { label: "Dashboard", href: "/management/dashboard" },
    { label: "Profit/loss", href: "/management/profit-loss" },
    { label: "Inventory", href: "/management/inventory" },
    { label: "Production", href: "/management/production" },
    { label: "Sales", href: "/management/sales" },
    { label: "Audit log", href: "/management/audit-log" },
  ],
};
