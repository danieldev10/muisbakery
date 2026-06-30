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
import { UnitsService } from "./units.service";

@UseGuards(AdminGuard)
@Controller("admin/units")
export class UnitsController {
  constructor(
    @Inject(UnitsService) private readonly units: UnitsService,
  ) {}

  @Get()
  list() {
    return this.units.list();
  }

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    return this.units.create(body, getRequestUser(request));
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.units.update(id, body, getRequestUser(request));
  }
}
