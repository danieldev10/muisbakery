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
import { ProductsService } from "./products.service";

@UseGuards(AdminGuard)
@Controller("admin/products")
export class ProductsController {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
  ) {}

  @Get()
  list() {
    return this.products.list();
  }

  @Get("stats")
  stats() {
    return this.products.stats();
  }

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    return this.products.create(body, getRequestUser(request));
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.products.update(id, body, getRequestUser(request));
  }
}
