import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Role } from "@prisma/client";
import { compare } from "bcryptjs";
import { parse } from "cookie";
import type { Request, Response } from "express";
import { z } from "zod";

import { PrismaService } from "../database/prisma.service";
import { authCookieMaxAgeMs, authCookieName } from "./auth.constants";
import type { AuthTokenPayload, AuthenticatedUser } from "./auth.types";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const FAILED_LOGIN_ACTION = "AUTH_LOGIN_FAILED";
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
// Per-email is strict; per-IP is looser because the whole bakery usually
// shares one router, and a low IP limit would lock every terminal at once.
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 30;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(JwtService)
    private readonly jwt: JwtService,
  ) {}

  async login(input: unknown, request: Request, response: Response) {
    const parsed = loginSchema.safeParse(input);

    if (!parsed.success) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const email = parsed.data.email.toLowerCase();

    await this.assertNotThrottled(email, request.ip);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      await this.recordFailedLogin(email, request);
      throw new UnauthorizedException("Invalid email or password.");
    }

    const passwordMatches = await compare(
      parsed.data.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      await this.recordFailedLogin(email, request);
      throw new UnauthorizedException("Invalid email or password.");
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    const token = await this.signToken(authenticatedUser);

    this.setAuthCookie(response, token);

    // Use an interactive transaction with a generous timeout: the pooled
    // connection can spike past the default 5s limit, and a slow bookkeeping
    // write should not turn a valid login into a 500.
    await this.prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            action: "AUTH_LOGIN",
            entityType: "User",
            entityId: user.id,
            actorId: user.id,
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"],
            metadata: {
              email: user.email,
              role: user.role,
            },
          },
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );

    return authenticatedUser;
  }

  async me(request: Request) {
    const user = await this.getUserFromRequest(request);

    if (!user) {
      throw new UnauthorizedException("Not signed in.");
    }

    return user;
  }

  logout(response: Response) {
    response.clearCookie(authCookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    return { ok: true };
  }

  async requireUser(request: Request) {
    const user = await this.getUserFromRequest(request);

    if (!user) {
      throw new UnauthorizedException("Not signed in.");
    }

    return user;
  }

  async requireRole(request: Request, ...roles: Role[]) {
    const user = await this.requireUser(request);

    if (roles.length > 0 && !roles.includes(user.role)) {
      throw new ForbiddenException(
        "You do not have access to this resource.",
      );
    }

    return user;
  }

  /**
   * Failed attempts are read back from the audit log, so lockouts survive
   * API restarts and leave an investigation trail for Management.
   */
  private async assertNotThrottled(email: string, ip: string | undefined) {
    const since = new Date(Date.now() - FAILED_LOGIN_WINDOW_MS);
    const [emailFailures, ipFailures] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          action: FAILED_LOGIN_ACTION,
          createdAt: { gte: since },
          metadata: { path: ["email"], equals: email },
        },
      }),
      ip
        ? this.prisma.auditLog.count({
            where: {
              action: FAILED_LOGIN_ACTION,
              createdAt: { gte: since },
              ipAddress: ip,
            },
          })
        : Promise.resolve(0),
    ]);

    if (
      emailFailures >= MAX_FAILURES_PER_EMAIL ||
      ipFailures >= MAX_FAILURES_PER_IP
    ) {
      throw new HttpException(
        "Too many failed login attempts. Try again in a few minutes.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailedLogin(email: string, request: Request) {
    await this.prisma.auditLog.create({
      data: {
        action: FAILED_LOGIN_ACTION,
        entityType: "User",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        metadata: { email },
      },
    });
  }

  private async getUserFromRequest(request: Request) {
    const token = this.readToken(request);

    if (!token) {
      return null;
    }

    let payload: AuthTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<AuthTokenPayload>(token);
    } catch {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user?.isActive) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    } satisfies AuthenticatedUser;
  }

  private async signToken(user: AuthenticatedUser) {
    return this.jwt.signAsync(
      {
        sub: user.id,
        role: user.role,
      } satisfies AuthTokenPayload,
      {
        expiresIn: "8h",
      },
    );
  }

  private setAuthCookie(response: Response, token: string) {
    response.cookie(authCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: authCookieMaxAgeMs,
    });
  }

  private readToken(request: Request) {
    const authorization = request.headers.authorization;

    if (authorization?.startsWith("Bearer ")) {
      return authorization.slice("Bearer ".length);
    }

    const cookies = parse(request.headers.cookie ?? "");
    return cookies[authCookieName] ?? null;
  }
}
