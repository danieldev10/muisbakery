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
    { label: "Settings", href: "/admin/settings" },
  ],
  STORE: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Store (coming soon)" },
  ],
  PRODUCTION: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Production (coming soon)" },
  ],
  SALES: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Sales (coming soon)" },
  ],
  MANAGEMENT: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Management (coming soon)" },
  ],
};
