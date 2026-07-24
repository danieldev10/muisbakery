import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthService } from "./auth.service";
import { PasswordRecoveryService } from "./password-recovery.service";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PasswordRecoveryService)
    private readonly passwordRecovery: PasswordRecoveryService,
  ) {}

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

  @Post("password-reset/request")
  requestPasswordReset(@Body() body: unknown, @Req() request: Request) {
    return this.passwordRecovery.requestCode(body, request);
  }

  @Post("password-reset/confirm")
  confirmPasswordReset(@Body() body: unknown, @Req() request: Request) {
    return this.passwordRecovery.confirmReset(body, request);
  }
}
