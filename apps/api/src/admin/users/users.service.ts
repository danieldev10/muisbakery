import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";

import { AuditService } from "../../audit/audit.service";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { PrismaService } from "../../database/prisma.service";

const roleEnum = z.enum([
  "ADMIN",
  "STORE",
  "PRODUCTION",
  "SALES",
  "MANAGEMENT",
]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  role: roleEnum,
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).nullish(),
    email: z.string().trim().toLowerCase().email().optional(),
    role: roleEnum.optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes provided.",
  });

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async create(input: unknown, actor: AuthenticatedUser) {
    const parsed = createSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("A user with that email already exists.");
    }

    const user = await this.prisma.user.create({
      data: {
        name: parsed.data.name ?? null,
        email: parsed.data.email,
        passwordHash: await hash(parsed.data.password, 12),
        role: parsed.data.role,
        createdById: actor.id,
      },
      select: userSelect,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_USER_CREATED",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });

    return user;
  }

  async update(id: string, input: unknown, actor: AuthenticatedUser) {
    const parsed = updateSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!target) {
      throw new NotFoundException("User not found.");
    }

    // Guard against an admin locking themselves out of the system.
    if (id === actor.id) {
      if (parsed.data.isActive === false) {
        throw new BadRequestException("You cannot deactivate your own account.");
      }
      if (parsed.data.role && parsed.data.role !== "ADMIN") {
        throw new BadRequestException("You cannot change your own role.");
      }
    }

    if (parsed.data.email) {
      const clash = await this.prisma.user.findFirst({
        where: { email: parsed.data.email, NOT: { id } },
        select: { id: true },
      });

      if (clash) {
        throw new ConflictException("A user with that email already exists.");
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.email ? { email: parsed.data.email } : {}),
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
        ...(parsed.data.isActive !== undefined
          ? { isActive: parsed.data.isActive }
          : {}),
        ...(parsed.data.password
          ? { passwordHash: await hash(parsed.data.password, 12) }
          : {}),
      },
      select: userSelect,
    });

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_USER_UPDATED",
      entityType: "User",
      entityId: user.id,
      metadata: {
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        passwordChanged: Boolean(parsed.data.password),
      },
    });

    return user;
  }
}
