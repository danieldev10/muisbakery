// Keep these IDs aligned with apps/api/scripts/seed-e2e.ts. The browser test
// package intentionally does not import API scripts into its TypeScript graph.
export const E2E_FIXTURES = {
  password: "E2ePass!123",
  users: {
    admin: {
      id: "e2e-user-admin",
      email: "admin.e2e@muisbakery.test",
      name: "E2E Admin",
    },
    sales: {
      id: "e2e-user-sales",
      email: "sales.e2e@muisbakery.test",
      name: "E2E Sales",
    },
    secondSales: {
      id: "e2e-user-sales-second",
      email: "sales-second.e2e@muisbakery.test",
      name: "E2E Sales Two",
    },
    management: {
      id: "e2e-user-management",
      email: "management.e2e@muisbakery.test",
      name: "E2E Management",
    },
  },
  products: {
    primary: {
      id: "e2e-product-primary",
      name: "E2E Primary Bread",
      size: "700g",
    },
    secondary: {
      id: "e2e-product-secondary",
      name: "E2E Secondary Bread",
      size: "500g",
    },
    reports: {
      id: "e2e-product-reports",
      name: "E2E Report Bread",
      size: "400g",
    },
  },
} as const;
