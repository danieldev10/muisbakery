import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AdminGuard } from "./admin.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    JwtModule.register({
      secret:
        process.env.AUTH_JWT_SECRET ??
        process.env.AUTH_SECRET ??
        process.env.NEXTAUTH_SECRET,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminGuard],
  exports: [AuthService, AdminGuard],
})
export class AuthModule {}
