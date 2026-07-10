import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ExpensesService } from "./expenses.service";
import { ManagementController } from "./management.controller";
import { ManagementService } from "./management.service";

@Module({
  imports: [AuthModule],
  controllers: [ManagementController],
  providers: [ManagementService, ExpensesService],
})
export class ManagementModule {}
