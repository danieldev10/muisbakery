import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { AdminGuard } from "../../auth/admin.guard";
import { getRequestUser } from "../../auth/auth.types";
import { SettingsService } from "./settings.service";

@UseGuards(AdminGuard)
@Controller("admin/settings")
export class SettingsController {
  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  update(@Body() body: unknown, @Req() request: Request) {
    return this.settings.update(body, getRequestUser(request));
  }
}
