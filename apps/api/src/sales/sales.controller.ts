import {
  Body,
  Controller,
  Get,
  Headers,
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
import type { QueryParams } from "../common/pagination";
import { DayCloseService } from "./day-close.service";
import { SalesService } from "./sales.service";

export const posTerminalSecretHeader = "x-muisbakery-pos-terminal-secret";

@UseGuards(SalesGuard)
@Controller("sales")
export class SalesController {
  constructor(
    @Inject(SalesService)
    private readonly sales: SalesService,
    @Inject(DayCloseService)
    private readonly dayClose: DayCloseService,
  ) {}

  @Get("day-close")
  dayClosePreview(@Query("date") date?: string) {
    return this.dayClose.preview(date);
  }

  @Post("day-close")
  submitDayClose(@Body() body: unknown, @Req() request: Request) {
    return this.dayClose.submit(body, getRequestUser(request));
  }

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

  @Get("retailer-payments")
  retailerPayments(@Query("retailerId") retailerId?: string) {
    return this.sales.listRetailerPayments(retailerId);
  }

  @Post("retailers/:id/payments")
  recordRetailerPayment(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.recordRetailerPayment(id, body, getRequestUser(request));
  }

  @Post("retailers/:id/order-approval-requests")
  requestRetailerOrderApproval(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.requestRetailerOrderApproval(
      id,
      body,
      getRequestUser(request),
    );
  }

  @Get("sales")
  salesList(@Query() query: QueryParams) {
    return this.sales.listSales(query);
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
  returnsList(@Query() query: QueryParams) {
    return this.sales.listReturns(query);
  }

  @Post("returns")
  recordReturn(@Body() body: unknown, @Req() request: Request) {
    return this.sales.recordReturn(body, getRequestUser(request));
  }

  @Post("pos/sessions")
  createPosSession(
    @Body() body: unknown,
    @Req() request: Request,
    @Headers(posTerminalSecretHeader) terminalSecret?: string,
  ) {
    return this.sales.createPosSession(
      body,
      getRequestUser(request),
      terminalSecret,
    );
  }

  @Get("pos/terminals/:id")
  getPosTerminal(
    @Param("id") id: string,
    @Headers(posTerminalSecretHeader) terminalSecret?: string,
  ) {
    return this.sales.getPosTerminal(id, terminalSecret);
  }

  @Get("pos/terminals/:id/offline-snapshot")
  getPosOfflineSnapshot(
    @Param("id") id: string,
    @Headers(posTerminalSecretHeader) terminalSecret?: string,
  ) {
    return this.sales.getPosOfflineSnapshot(id, terminalSecret);
  }

  @Post("pos/terminals/pair")
  pairPosTerminal(@Body() body: unknown, @Req() request: Request) {
    return this.sales.pairPosTerminal(body, getRequestUser(request));
  }

  @Post("pos/sync")
  syncOfflinePosSales(
    @Body() body: unknown,
    @Req() request: Request,
    @Headers(posTerminalSecretHeader) terminalSecret?: string,
  ) {
    return this.sales.syncOfflinePosSales(
      body,
      getRequestUser(request),
      terminalSecret,
    );
  }

  @Get("pos/sessions/:id")
  getPosSession(
    @Param("id") id: string,
    @Req() request: Request,
    @Headers(posTerminalSecretHeader) terminalSecret?: string,
  ) {
    return this.sales.getPosSession(
      id,
      getRequestUser(request),
      terminalSecret,
    );
  }

  @Patch("pos/sessions/:id")
  updatePosSession(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Headers(posTerminalSecretHeader) terminalSecret?: string,
  ) {
    return this.sales.updatePosSession(
      id,
      body,
      getRequestUser(request),
      terminalSecret,
    );
  }

  @Patch("pos/sessions/:id/items")
  upsertPosSessionItem(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Headers(posTerminalSecretHeader) terminalSecret?: string,
  ) {
    return this.sales.upsertPosSessionItem(
      id,
      body,
      getRequestUser(request),
      terminalSecret,
    );
  }

  @Post("pos/sessions/:id/checkout")
  checkoutPosSession(
    @Param("id") id: string,
    @Req() request: Request,
    @Headers(posTerminalSecretHeader) terminalSecret?: string,
  ) {
    return this.sales.checkoutPosSession(
      id,
      getRequestUser(request),
      terminalSecret,
    );
  }

  @Post("pos/sessions/:id/cancel")
  cancelPosSession(
    @Param("id") id: string,
    @Req() request: Request,
    @Headers(posTerminalSecretHeader) terminalSecret?: string,
  ) {
    return this.sales.cancelPosSession(
      id,
      getRequestUser(request),
      terminalSecret,
    );
  }

  @Get("pos/retailers")
  posRetailers() {
    return this.sales.listRetailers();
  }

  @Post("pos/retailers/:id/order-approval-requests")
  requestPosRetailerOrderApproval(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.sales.requestRetailerOrderApproval(
      id,
      body,
      getRequestUser(request),
    );
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
