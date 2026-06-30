import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ExpenseCategoriesController } from "./expense-categories/expense-categories.controller";
import { ExpenseCategoriesService } from "./expense-categories/expense-categories.service";
import { ProductsController } from "./products/products.controller";
import { ProductsService } from "./products/products.service";
import { RawMaterialsController } from "./raw-materials/raw-materials.controller";
import { RawMaterialsService } from "./raw-materials/raw-materials.service";
import { RecipesController } from "./recipes/recipes.controller";
import { RecipesService } from "./recipes/recipes.service";
import { SettingsController } from "./settings/settings.controller";
import { SettingsService } from "./settings/settings.service";
import { SuppliersController } from "./suppliers/suppliers.controller";
import { SuppliersService } from "./suppliers/suppliers.service";
import { UnitsController } from "./units/units.controller";
import { UnitsService } from "./units/units.service";
import { UsersController } from "./users/users.controller";
import { UsersService } from "./users/users.service";

@Module({
  imports: [AuthModule],
  controllers: [
    UsersController,
    UnitsController,
    SuppliersController,
    RawMaterialsController,
    ProductsController,
    RecipesController,
    ExpenseCategoriesController,
    SettingsController,
  ],
  providers: [
    UsersService,
    UnitsService,
    SuppliersService,
    RawMaterialsService,
    ProductsService,
    RecipesService,
    ExpenseCategoriesService,
    SettingsService,
  ],
})
export class AdminModule {}
