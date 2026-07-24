import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getJwtSecret } from "../config/env";
import { PrismaService } from "../database/prisma.service";
import { MailService } from "../mail/mail.service";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const confirmSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{8}$/),
  password: z.string().min(12).max(200),
});

const CODE_TTL_MINUTES = 15;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const MAX_CODE_ATTEMPTS = 5;
const GENERIC_REQUEST_MESSAGE =
  "If the account can be recovered, a code has been sent to its recovery email.";
const INVALID_CODE_MESSAGE = "Invalid or expired recovery code.";

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(MailService)
    private readonly mail: MailService,
  ) {}

  async requestCode(input: unknown, request: Request) {
    const parsed = requestSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException("Enter a valid account email address.");
    }

    const user = await this.prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        name: true,
        recoveryEmail: true,
        isActive: true,
      },
    });

    if (!user?.isActive || !user.recoveryEmail) {
      this.hashCode("unknown-account", "00000000");
      return this.genericRequestResponse();
    }

    const code = randomInt(0, 100_000_000).toString().padStart(8, "0");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    const token = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`,
      );
      const recentRequests = await transaction.passwordResetToken.count({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(now.getTime() - REQUEST_WINDOW_MS) },
        },
      });

      if (recentRequests >= MAX_REQUESTS_PER_WINDOW) {
        return null;
      }

      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });

      return transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          codeHash: this.hashCode(user.id, code),
          expiresAt,
          requestIp: request.ip,
          userAgent: request.headers["user-agent"],
        },
      });
    });

    if (!token) {
      return this.genericRequestResponse();
    }

    try {
      await this.mail.sendPasswordResetCode({
        to: user.recoveryEmail,
        name: user.name,
        code,
        expiresInMinutes: CODE_TTL_MINUTES,
      });

      await this.prisma.auditLog.create({
        data: {
          action: "AUTH_PASSWORD_RESET_REQUESTED",
          entityType: "User",
          entityId: user.id,
          actorId: user.id,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            recoveryEmailDomain: user.recoveryEmail.split("@")[1] ?? null,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
    } catch (error) {
      await this.prisma.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.prisma.auditLog.create({
        data: {
          action: "AUTH_PASSWORD_RESET_DELIVERY_FAILED",
          entityType: "User",
          entityId: user.id,
          actorId: user.id,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
        },
      });
      this.logger.error(
        `Password recovery delivery failed for user ${user.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return this.genericRequestResponse();
  }

  async confirmReset(input: unknown, request: Request) {
    const parsed = confirmSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    const user = await this.prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, isActive: true, passwordHash: true },
    });

    if (!user?.isActive) {
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
        failedAttempts: { lt: MAX_CODE_ATTEMPTS },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!token || !this.codeMatches(user.id, parsed.data.code, token.codeHash)) {
      if (token) {
        const failedAttempts = token.failedAttempts + 1;

        await this.prisma.passwordResetToken.updateMany({
          where: { id: token.id, usedAt: null },
          data: {
            failedAttempts: { increment: 1 },
            ...(failedAttempts >= MAX_CODE_ATTEMPTS
              ? { usedAt: new Date() }
              : {}),
          },
        });
      }

      await this.prisma.auditLog.create({
        data: {
          action: "AUTH_PASSWORD_RESET_FAILED",
          entityType: "User",
          entityId: user.id,
          actorId: user.id,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
        },
      });
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    if (await compare(parsed.data.password, user.passwordHash)) {
      throw new BadRequestException(
        "Choose a password different from your current password.",
      );
    }

    const now = new Date();
    const passwordHash = await hash(parsed.data.password, 12);

    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.passwordResetToken.updateMany({
        where: {
          id: token.id,
          usedAt: null,
          expiresAt: { gt: now },
          failedAttempts: { lt: MAX_CODE_ATTEMPTS },
        },
        data: { usedAt: now },
      });

      if (claimed.count !== 1) {
        throw new BadRequestException(INVALID_CODE_MESSAGE);
      }

      await transaction.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          authVersion: { increment: 1 },
        },
      });
      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          action: "AUTH_PASSWORD_RESET_COMPLETED",
          entityType: "User",
          entityId: user.id,
          actorId: user.id,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
        },
      });
    });

    return {
      ok: true,
      message: "Password reset. Sign in with your new password.",
    };
  }

  private genericRequestResponse() {
    return { ok: true, message: GENERIC_REQUEST_MESSAGE };
  }

  private hashCode(userId: string, code: string) {
    return createHmac("sha256", getJwtSecret())
      .update(`${userId}:${code}`)
      .digest("hex");
  }

  private codeMatches(userId: string, code: string, expectedHash: string) {
    const actual = Buffer.from(this.hashCode(userId, code), "hex");
    const expected = Buffer.from(expectedHash, "hex");

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
