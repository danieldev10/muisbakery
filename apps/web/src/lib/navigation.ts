import type { AppRole } from "@/lib/roles";

export type NavItem = {
  label: string;
  /** When omitted the item renders as a disabled placeholder (future phase). */
  href?: string;
};

export const roleNav: Record<AppRole, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Users", href: "/admin/users" },
    { label: "Raw materials", href: "/admin/raw-materials" },
    { label: "Products", href: "/admin/products" },
    { label: "Suppliers", href: "/admin/suppliers" },
    { label: "Recipes", href: "/admin/recipes" },
    { label: "Store inventory", href: "/store/inventory" },
    { label: "Store requests", href: "/store/requests" },
    { label: "Production requests", href: "/production/requests" },
    { label: "Production inventory", href: "/production/inventory" },
    { label: "Production output", href: "/production/output" },
    { label: "Point of sale", href: "/sales/pos" },
    { label: "Sales inventory", href: "/sales/inventory" },
    { label: "Record sale", href: "/sales/record-sale" },
    { label: "Sales summary", href: "/sales/daily-summary" },
    { label: "Returns", href: "/sales/returns" },
    { label: "Management dashboard", href: "/management/dashboard" },
    { label: "Profit/loss", href: "/management/profit-loss" },
    { label: "Management inventory", href: "/management/inventory" },
    { label: "Management production", href: "/management/production" },
    { label: "Management sales", href: "/management/sales" },
    { label: "Audit log", href: "/management/audit-log" },
    { label: "Settings", href: "/admin/settings" },
  ],
  STORE: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Inventory", href: "/store/inventory" },
    { label: "Receive materials", href: "/store/receiving" },
    { label: "Material requests", href: "/store/requests" },
  ],
  PRODUCTION: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Material requests", href: "/production/requests" },
    { label: "Inventory", href: "/production/inventory" },
    { label: "Output", href: "/production/output" },
    { label: "Runs", href: "/production/runs" },
    { label: "Waste", href: "/production/waste" },
  ],
  SALES: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Point of sale", href: "/sales/pos" },
    { label: "Inventory", href: "/sales/inventory" },
    { label: "Record sale", href: "/sales/record-sale" },
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
