import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { AdminGuard } from "../../auth/admin.guard";
import { getRequestUser } from "../../auth/auth.types";
import { SalesService } from "../../sales/sales.service";

@UseGuards(AdminGuard)
@Controller("admin/pos-terminals")
export class PosTerminalsController {
  constructor(
    @Inject(SalesService)
    private readonly sales: SalesService,
  ) {}

  @Get()
  list() {
    return this.sales.listPosTerminals();
  }

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    return this.sales.createPosTerminal(body, getRequestUser(request));
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.updatePosTerminal(id, body, getRequestUser(request));
  }

  @Post(":id/stock-allocations")
  setStockAllocation(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.setPosTerminalStockAllocation(
      id,
      body,
      getRequestUser(request),
    );
  }

  @Post(":id/retailer-credit-allocations")
  setRetailerCreditAllocation(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.setPosTerminalRetailerCreditAllocation(
      id,
      body,
      getRequestUser(request),
    );
  }
}
