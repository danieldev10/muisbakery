import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { getJwtSecret } from "../config/env";
import { MailModule } from "../mail/mail.module";
import { AdminGuard } from "./admin.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordRecoveryService } from "./password-recovery.service";

@Module({
  imports: [
    MailModule,
    JwtModule.register({
      // Throws when unset: tokens must never be signed with an
      // undefined/empty secret.
      secret: getJwtSecret(),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordRecoveryService, AdminGuard],
  exports: [AuthService, AdminGuard],
})
export class AuthModule {}
