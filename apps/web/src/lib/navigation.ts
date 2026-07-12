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
    { label: "Retailers", href: "/admin/retailers" },
    { label: "POS terminals", href: "/admin/pos-terminals" },
    { label: "Recipes", href: "/admin/recipes" },
    { label: "Units", href: "/admin/units" },
    { label: "Expense categories", href: "/admin/expense-categories" },
  ],
  STORE: [
    { label: "Dashboard", href: "/store/dashboard" },
    { label: "Inventory", href: "/store/inventory" },
    { label: "Receive materials", href: "/store/receiving" },
    { label: "Material requests", href: "/store/requests" },
  ],
  PRODUCTION: [
    { label: "Inventory", href: "/production/inventory" },
    { label: "Material requests", href: "/production/requests" },
    { label: "Output", href: "/production/output" },
    { label: "Runs", href: "/production/runs" },
    { label: "Waste", href: "/production/waste" },
  ],
  SALES: [
    { label: "Point of sale", href: "/sales/pos" },
    { label: "Retailers", href: "/sales/retailers" },
    { label: "Inventory", href: "/sales/inventory" },
    { label: "Daily summary", href: "/sales/daily-summary" },
    { label: "Returns", href: "/sales/returns" },
  ],
  MANAGEMENT: [
    { label: "Dashboard", href: "/management/dashboard" },
    { label: "Profit/loss", href: "/management/profit-loss" },
    { label: "Expenses", href: "/management/expenses" },
    { label: "Inventory", href: "/management/inventory" },
    { label: "Production", href: "/management/production" },
    { label: "Sales", href: "/management/sales" },
    { label: "Audit log", href: "/management/audit-log" },
  ],
};
