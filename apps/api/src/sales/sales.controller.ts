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

import { SalesGuard } from "../auth/sales.guard";
import { getRequestUser } from "../auth/auth.types";
import { SalesService } from "./sales.service";

@UseGuards(SalesGuard)
@Controller("sales")
export class SalesController {
  constructor(
    @Inject(SalesService)
    private readonly sales: SalesService,
  ) {}

  @Get("inventory")
  inventory() {
    return this.sales.inventory();
  }

  @Get("options")
  options() {
    return this.sales.options();
  }

  @Get("retailers")
  retailers() {
    return this.sales.listRetailers();
  }

  @Post("retailers")
  createRetailer(@Body() body: unknown, @Req() request: Request) {
    return this.sales.createRetailer(body, getRequestUser(request));
  }

  @Patch("retailers/:id")
  updateRetailer(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.updateRetailer(id, body, getRequestUser(request));
  }

  @Get("sales")
  salesList() {
    return this.sales.listSales();
  }

  @Post("sales")
  createSale(@Body() body: unknown, @Req() request: Request) {
    return this.sales.createSale(body, getRequestUser(request));
  }

  @Get("summary")
  summary(@Query("date") date?: string) {
    return this.sales.summary(date);
  }

  @Get("returns")
  returnsList() {
    return this.sales.listReturns();
  }

  @Post("returns")
  recordReturn(@Body() body: unknown, @Req() request: Request) {
    return this.sales.recordReturn(body, getRequestUser(request));
  }

  @Post("pos/sessions")
  createPosSession(@Body() body: unknown, @Req() request: Request) {
    return this.sales.createPosSession(body, getRequestUser(request));
  }

  @Post("pos/terminals")
  createPosTerminal(@Body() body: unknown, @Req() request: Request) {
    return this.sales.createPosTerminal(body, getRequestUser(request));
  }

  @Get("pos/terminals/:id")
  getPosTerminal(@Param("id") id: string) {
    return this.sales.getPosTerminal(id);
  }

  @Get("pos/sessions/:id")
  getPosSession(@Param("id") id: string, @Req() request: Request) {
    return this.sales.getPosSession(id, getRequestUser(request));
  }

  @Patch("pos/sessions/:id")
  updatePosSession(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.updatePosSession(id, body, getRequestUser(request));
  }

  @Patch("pos/sessions/:id/items")
  upsertPosSessionItem(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.upsertPosSessionItem(id, body, getRequestUser(request));
  }

  @Post("pos/sessions/:id/checkout")
  checkoutPosSession(@Param("id") id: string, @Req() request: Request) {
    return this.sales.checkoutPosSession(id, getRequestUser(request));
  }

  @Post("pos/sessions/:id/cancel")
  cancelPosSession(@Param("id") id: string, @Req() request: Request) {
    return this.sales.cancelPosSession(id, getRequestUser(request));
  }
}

@Controller("sales/pos/display")
export class SalesDisplayController {
  constructor(
    @Inject(SalesService)
    private readonly sales: SalesService,
  ) {}

  @Get("terminal/:token")
  getTerminalDisplay(@Param("token") token: string) {
    return this.sales.getPosTerminalDisplay(token);
  }

  @Get(":token")
  getDisplay(@Param("token") token: string) {
    return this.sales.getPosDisplay(token);
  }
}
