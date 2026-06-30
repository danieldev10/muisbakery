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
import { ExpenseCategoriesService } from "./expense-categories.service";

@UseGuards(AdminGuard)
@Controller("admin/expense-categories")
export class ExpenseCategoriesController {
  constructor(
    @Inject(ExpenseCategoriesService)
    private readonly categories: ExpenseCategoriesService,
  ) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    return this.categories.create(body, getRequestUser(request));
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.categories.update(id, body, getRequestUser(request));
  }
}
