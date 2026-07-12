import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { ExpenseCategoriesController } from "../src/admin/expense-categories/expense-categories.controller";
import { PosTerminalsController } from "../src/admin/pos-terminals/pos-terminals.controller";
import { ProductsController } from "../src/admin/products/products.controller";
import { RawMaterialsController } from "../src/admin/raw-materials/raw-materials.controller";
import { RecipesController } from "../src/admin/recipes/recipes.controller";
import { AdminRetailersController } from "../src/admin/retailers/retailers.controller";
import { SuppliersController } from "../src/admin/suppliers/suppliers.controller";
import { UnitsController } from "../src/admin/units/units.controller";
import { UsersController } from "../src/admin/users/users.controller";
import { AdminGuard } from "../src/auth/admin.guard";
import { ManagementGuard } from "../src/auth/management.guard";
import { ProductionGuard } from "../src/auth/production.guard";
import { SalesGuard } from "../src/auth/sales.guard";
import { StoreGuard } from "../src/auth/store.guard";
import { ManagementController } from "../src/management/management.controller";
import { ProductionController } from "../src/production/production.controller";
import { SalesController } from "../src/sales/sales.controller";
import { StoreController } from "../src/store/store.controller";

// If a controller ever loses its @UseGuards decorator, every endpoint in it
// silently becomes public. This pins the guard wiring in place.
const EXPECTED_GUARDS: Array<[string, unknown, unknown]> = [
  ["StoreController", StoreController, StoreGuard],
  ["ProductionController", ProductionController, ProductionGuard],
  ["SalesController", SalesController, SalesGuard],
  ["ManagementController", ManagementController, ManagementGuard],
  ["UsersController", UsersController, AdminGuard],
  ["ProductsController", ProductsController, AdminGuard],
  ["RawMaterialsController", RawMaterialsController, AdminGuard],
  ["SuppliersController", SuppliersController, AdminGuard],
  ["AdminRetailersController", AdminRetailersController, AdminGuard],
  ["PosTerminalsController", PosTerminalsController, AdminGuard],
  ["RecipesController", RecipesController, AdminGuard],
  ["UnitsController", UnitsController, AdminGuard],
  ["ExpenseCategoriesController", ExpenseCategoriesController, AdminGuard],
];

test("every business controller is protected by its role guard", () => {
  for (const [name, controller, guard] of EXPECTED_GUARDS) {
    const guards = Reflect.getMetadata("__guards__", controller) as
      | unknown[]
      | undefined;

    assert.ok(guards && guards.length > 0, `${name} has no guards at all`);
    assert.ok(
      guards.includes(guard),
      `${name} is missing its expected role guard`,
    );
  }
});
