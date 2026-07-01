import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AppController } from "./app.controller";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DatabaseModule } from "./database/database.module";
import { ManagementModule } from "./management/management.module";
import { ProductionModule } from "./production/production.module";
import { SalesModule } from "./sales/sales.module";
import { StoreModule } from "./store/store.module";

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    AuthModule,
    DashboardModule,
    AdminModule,
    StoreModule,
    ProductionModule,
    SalesModule,
    ManagementModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
