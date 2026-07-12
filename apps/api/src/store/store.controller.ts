import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import type { QueryParams } from "../common/pagination";
import { StoreGuard } from "../auth/store.guard";
import { getRequestUser } from "../auth/auth.types";
import { StoreService } from "./store.service";

@UseGuards(StoreGuard)
@Controller("store")
export class StoreController {
  constructor(
    @Inject(StoreService)
    private readonly store: StoreService,
  ) {}

  @Get("options")
  options() {
    return this.store.options();
  }

  @Get("inventory")
  inventory() {
    return this.store.inventory();
  }

  @Get("batches")
  batches(@Query() query: QueryParams) {
    return this.store.listBatches(query);
  }

  @Get("receipts")
  receipts(@Query() query: QueryParams) {
    return this.store.listReceipts(query);
  }

  @Post("receipts")
  receive(@Body() body: unknown, @Req() request: Request) {
    return this.store.receive(body, getRequestUser(request));
  }

  @Get("material-requests")
  materialRequests(@Query() query: QueryParams) {
    return this.store.listMaterialRequests(query);
  }

  @Post("material-requests/:id/issue")
  issueMaterialRequest(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.store.issueMaterialRequest(id, body, getRequestUser(request));
  }

  @Post("material-requests/:id/reject")
  rejectMaterialRequest(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.store.rejectMaterialRequest(id, body, getRequestUser(request));
  }
}
