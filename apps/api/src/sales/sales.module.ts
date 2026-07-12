import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DayCloseService } from "./day-close.service";
import { PosDisplayEvents } from "./pos-display-events";
import { PosDisplayGateway } from "./pos-display.gateway";
import { SalesController, SalesDisplayController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [AuthModule],
  controllers: [SalesController, SalesDisplayController],
  providers: [
    SalesService,
    DayCloseService,
    PosDisplayEvents,
    PosDisplayGateway,
  ],
  exports: [SalesService, DayCloseService],
})
export class SalesModule {}
