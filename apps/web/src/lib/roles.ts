export const roles = [
  "ADMIN",
  "STORE",
  "PRODUCTION",
  "SALES",
  "MANAGEMENT",
] as const;

export type AppRole = (typeof roles)[number];

export const roleLabels: Record<AppRole, string> = {
  ADMIN: "Admin",
  STORE: "Store",
  PRODUCTION: "Production",
  SALES: "Sales",
  MANAGEMENT: "Management",
};

export const roleDescriptions: Record<AppRole, string> = {
  ADMIN: "System setup and user administration",
  STORE: "Raw material receiving, stock, and issuing",
  PRODUCTION: "Material requests and production output",
  SALES: "Finished goods sales and daily sales records",
  MANAGEMENT: "Business oversight and profit/loss reporting",
};

export const roleDashboards: Record<AppRole, string> = {
  ADMIN: "/dashboard",
  STORE: "/store/inventory",
  PRODUCTION: "/production/requests",
  SALES: "/sales/inventory",
  MANAGEMENT: "/management/dashboard",
};

export const roleScopes: Record<AppRole, string[]> = {
  ADMIN: ["dashboard", "admin", "store", "production", "sales", "management"],
  STORE: ["dashboard", "store"],
  PRODUCTION: ["dashboard", "production"],
  SALES: ["dashboard", "sales"],
  MANAGEMENT: ["dashboard", "management"],
};

export function isAppRole(role: unknown): role is AppRole {
  return typeof role === "string" && roles.includes(role as AppRole);
}

export function getRoleHome(role: unknown) {
  return isAppRole(role) ? roleDashboards[role] : "/dashboard";
}

export function canAccessSection(role: AppRole, section: string) {
  return roleScopes[role].includes(section);
}
