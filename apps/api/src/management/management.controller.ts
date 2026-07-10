import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { getRequestUser } from "../auth/auth.types";
import { ManagementGuard } from "../auth/management.guard";
import { ExpensesService } from "./expenses.service";
import { ManagementService } from "./management.service";

@UseGuards(ManagementGuard)
@Controller("management")
export class ManagementController {
  constructor(
    @Inject(ManagementService)
    private readonly management: ManagementService,
    @Inject(ExpensesService)
    private readonly expenses: ExpensesService,
  ) {}

  @Get("dashboard")
  dashboard(@Query("month") month?: string) {
    return this.management.dashboard(month);
  }

  @Get("profit-loss")
  profitLoss(@Query("month") month?: string) {
    return this.management.profitLoss(month);
  }

  @Get("inventory")
  inventory() {
    return this.management.inventory();
  }

  @Patch("raw-materials/:id/unit-cost")
  updateRawMaterialUnitCost(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.management.updateRawMaterialUnitCost(
      id,
      body,
      getRequestUser(request),
    );
  }

  @Get("expenses")
  listExpenses(@Query("month") month?: string) {
    return this.expenses.list(month);
  }

  @Post("expenses")
  createExpense(@Body() body: unknown, @Req() request: Request) {
    return this.expenses.create(body, getRequestUser(request));
  }

  @Post("expenses/:id/void")
  voidExpense(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.expenses.void(id, body, getRequestUser(request));
  }

  @Get("production")
  production(@Query("month") month?: string) {
    return this.management.production(month);
  }

  @Get("sales")
  sales(@Query("month") month?: string) {
    return this.management.sales(month);
  }

  @Get("audit-log")
  auditLog() {
    return this.management.auditLog();
  }
}
