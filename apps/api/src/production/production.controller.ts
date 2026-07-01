import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { ProductionGuard } from "../auth/production.guard";
import { getRequestUser } from "../auth/auth.types";
import { ProductionService } from "./production.service";

@UseGuards(ProductionGuard)
@Controller("production")
export class ProductionController {
  constructor(
    @Inject(ProductionService)
    private readonly production: ProductionService,
  ) {}

  @Get("options")
  options() {
    return this.production.options();
  }

  @Get("material-requests")
  materialRequests(@Req() request: Request) {
    return this.production.listMaterialRequests(getRequestUser(request));
  }

  @Get("inventory")
  inventory() {
    return this.production.inventory();
  }

  @Post("material-requests")
  createMaterialRequest(@Body() body: unknown, @Req() request: Request) {
    return this.production.createMaterialRequest(body, getRequestUser(request));
  }

  @Post("material-requests/:id/cancel")
  cancelMaterialRequest(@Param("id") id: string, @Req() request: Request) {
    return this.production.cancelMaterialRequest(id, getRequestUser(request));
  }

  @Get("runs")
  runs() {
    return this.production.listRuns();
  }

  @Post("runs")
  createRun(@Body() body: unknown, @Req() request: Request) {
    return this.production.createRun(body, getRequestUser(request));
  }

  @Get("waste")
  waste() {
    return this.production.listWaste();
  }
}
