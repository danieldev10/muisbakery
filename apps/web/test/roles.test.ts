import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canAccessSection,
  getRoleHome,
  isAppRole,
} from "../src/lib/roles";
import { roleNav } from "../src/lib/navigation";

test("getRoleHome sends each role to its role-owned landing page", () => {
  assert.equal(getRoleHome("ADMIN"), "/admin/dashboard");
  assert.equal(getRoleHome("STORE"), "/store/dashboard");
  assert.equal(getRoleHome("PRODUCTION"), "/production/inventory");
  assert.equal(getRoleHome("SALES"), "/sales/pos");
  assert.equal(getRoleHome("MANAGEMENT"), "/management/dashboard");
  assert.equal(getRoleHome("UNKNOWN"), "/unauthorized");
});

test("role section access follows the configured role scopes", () => {
  assert.equal(isAppRole("SALES"), true);
  assert.equal(isAppRole("BOGUS"), false);
  assert.equal(canAccessSection("ADMIN", "management"), true);
  assert.equal(canAccessSection("STORE", "store"), true);
  assert.equal(canAccessSection("STORE", "sales"), false);
  assert.equal(canAccessSection("SALES", "sales"), true);
  assert.equal(canAccessSection("SALES", "admin"), false);
});

test("management navigation exposes focused inventory and production routes", () => {
  const inventory = roleNav.MANAGEMENT.find(
    (item) => item.href === "/management/inventory",
  );
  const production = roleNav.MANAGEMENT.find(
    (item) => item.href === "/management/production",
  );

  assert.deepEqual(
    inventory?.children?.map((item) => item.href),
    [
      "/management/inventory/raw-materials",
      "/management/inventory/finished-goods",
    ],
  );
  assert.deepEqual(
    production?.children?.map((item) => item.href),
    [
      "/management/production",
      "/management/production/runs",
      "/management/production/raw-material-usage",
    ],
  );
});
