import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../database/prisma.service";

@Controller("dashboard")
export class DashboardController {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  @Get("summary")
  async summary(@Req() request: Request) {
    await this.auth.requireUser(request);

    const [activeUserCount, auditLogCount, latestAuditLog] =
      await Promise.all([
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.auditLog.count(),
        this.prisma.auditLog.findFirst({
          orderBy: { createdAt: "desc" },
          select: { action: true, createdAt: true },
        }),
      ]);

    return {
      activeUserCount,
      auditLogCount,
      latestAuditLog,
    };
  }
}
