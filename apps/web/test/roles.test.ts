import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canAccessSection,
  getRoleHome,
  isAppRole,
} from "../src/lib/roles";

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
