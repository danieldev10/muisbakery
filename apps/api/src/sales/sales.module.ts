import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PosDisplayEvents } from "./pos-display-events";
import { PosDisplayGateway } from "./pos-display.gateway";
import { SalesController, SalesDisplayController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [AuthModule],
  controllers: [SalesController, SalesDisplayController],
  providers: [SalesService, PosDisplayEvents, PosDisplayGateway],
  exports: [SalesService],
})
export class SalesModule {}
