import {
  Body,
  Controller,
  Delete,
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
import { RecipesService } from "./recipes.service";

@UseGuards(AdminGuard)
@Controller("admin/recipes")
export class RecipesController {
  constructor(
    @Inject(RecipesService) private readonly recipes: RecipesService,
  ) {}

  @Get()
  list() {
    return this.recipes.list();
  }

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    return this.recipes.create(body, getRequestUser(request));
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.recipes.update(id, body, getRequestUser(request));
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() request: Request) {
    return this.recipes.remove(id, getRequestUser(request));
  }
}
