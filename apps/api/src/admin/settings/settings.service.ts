import {
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { z } from "zod";

import { AuditService } from "../../audit/audit.service";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { PrismaService } from "../../database/prisma.service";

/**
 * Approval settings the Admin can toggle. Stored as individual rows in the
 * `Setting` table so later phases can read them when gating workflow steps.
 */
const SETTING_DEFAULTS = {
  requireMaterialRequestApproval: true,
  requireStockAdjustmentApproval: true,
};

type AppSettings = typeof SETTING_DEFAULTS;

const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as (keyof AppSettings)[];

const updateSchema = z
  .object({
    requireMaterialRequestApproval: z.boolean().optional(),
    requireStockAdjustmentApproval: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No changes provided.",
  });

@Injectable()
export class SettingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async get(): Promise<AppSettings> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: SETTING_KEYS } },
    });

    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const result = { ...SETTING_DEFAULTS };

    for (const key of SETTING_KEYS) {
      const value = stored.get(key);
      if (typeof value === "boolean") {
        result[key] = value;
      }
    }

    return result;
  }

  async update(input: unknown, actor: AuthenticatedUser) {
    const parsed = updateSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const entries = Object.entries(parsed.data) as [
      keyof AppSettings,
      boolean,
    ][];

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    );

    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_SETTINGS_UPDATED",
      entityType: "Setting",
      metadata: parsed.data,
    });

    return this.get();
  }
}
