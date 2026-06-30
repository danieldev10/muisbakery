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
import { RawMaterialsService } from "./raw-materials.service";

@UseGuards(AdminGuard)
@Controller("admin/raw-materials")
export class RawMaterialsController {
  constructor(
    @Inject(RawMaterialsService)
    private readonly rawMaterials: RawMaterialsService,
  ) {}

  @Get()
  list() {
    return this.rawMaterials.list();
  }

  @Post()
  create(@Body() body: unknown, @Req() request: Request) {
    return this.rawMaterials.create(body, getRequestUser(request));
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    return this.rawMaterials.update(id, body, getRequestUser(request));
  }
}
