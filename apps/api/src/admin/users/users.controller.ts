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
import { UsersService } from "./users.service";

@UseGuards(AdminGuard)
@Controller("admin/users")
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    return this.users.create(body, getRequestUser(request));
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.users.update(id, body, getRequestUser(request));
  }
}
