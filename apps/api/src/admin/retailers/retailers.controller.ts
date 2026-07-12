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
@Controller("admin/retailers")
export class AdminRetailersController {
  constructor(
    @Inject(SalesService)
    private readonly sales: SalesService,
  ) {}

  @Get()
  list() {
    return this.sales.listRetailers();
  }

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    return this.sales.createRetailer(body, getRequestUser(request));
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.updateRetailer(id, body, getRequestUser(request));
  }

  @Post(":id/order-approvals")
  createOrderApproval(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.createRetailerOrderApproval(
      id,
      body,
      getRequestUser(request),
    );
  }

  @Patch(":id/order-approvals/:approvalId")
  updateOrderApproval(
    @Param("id") id: string,
    @Param("approvalId") approvalId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.updateRetailerOrderApproval(
      id,
      approvalId,
      body,
      getRequestUser(request),
    );
  }
}
