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
    management: {
      id: "e2e-user-management",
      email: "management.e2e@muisbakery.test",
      name: "E2E Management",
    },
  },
  products: {
    allocated: {
      id: "e2e-product-allocated",
      name: "E2E Allocated Bread",
      size: "700g",
    },
    unallocated: {
      id: "e2e-product-unallocated",
      name: "E2E Unallocated Bread",
      size: "500g",
    },
    reports: {
      id: "e2e-product-reports",
      name: "E2E Report Bread",
      size: "400g",
    },
  },
} as const;
