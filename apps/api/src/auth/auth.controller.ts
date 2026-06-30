import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(body, request, response);
  }

  @Get("me")
  me(@Req() request: Request) {
    return this.auth.me(request);
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) response: Response) {
    return this.auth.logout(response);
  }
}
