import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";

import { ManagementGuard } from "../auth/management.guard";
import { ManagementService } from "./management.service";

@UseGuards(ManagementGuard)
@Controller("management")
export class ManagementController {
  constructor(
    @Inject(ManagementService)
    private readonly management: ManagementService,
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
