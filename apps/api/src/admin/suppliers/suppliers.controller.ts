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
import { SuppliersService } from "./suppliers.service";

@UseGuards(AdminGuard)
@Controller("admin/suppliers")
export class SuppliersController {
  constructor(
    @Inject(SuppliersService) private readonly suppliers: SuppliersService,
  ) {}

  @Get()
  list() {
    return this.suppliers.list();
  }

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    return this.suppliers.create(body, getRequestUser(request));
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.suppliers.update(id, body, getRequestUser(request));
  }
}
