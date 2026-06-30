import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AppController } from "./app.controller";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DatabaseModule } from "./database/database.module";

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    AuthModule,
    DashboardModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
