import { ConflictException } from "@nestjs/common";
import { BusinessDayStatus, Prisma } from "@prisma/client";

export class BusinessDayPostingLockedException extends ConflictException {
  readonly conflictCode = "DAY_CLOSE_LOCKED";
}

export function businessDateFromString(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function businessDateForInstant(instant: Date) {
  return new Date(
    Date.UTC(
      instant.getUTCFullYear(),
      instant.getUTCMonth(),
      instant.getUTCDate(),
    ),
  );
}

export async function lockBusinessDayState(
  tx: Prisma.TransactionClient,
  businessDate: Date,
) {
  await tx.$executeRaw(
    Prisma.sql`
      INSERT INTO "BusinessDayState" ("businessDate", "updatedAt")
      VALUES (${businessDate}, CURRENT_TIMESTAMP)
      ON CONFLICT ("businessDate") DO NOTHING
    `,
  );
  await tx.$executeRaw(
    Prisma.sql`SELECT 1 FROM "BusinessDayState" WHERE "businessDate" = ${businessDate} FOR UPDATE`,
  );
  return tx.businessDayState.findUniqueOrThrow({ where: { businessDate } });
}

export async function recordBusinessDayActivity(
  tx: Prisma.TransactionClient,
  occurredAt: Date,
) {
  const businessDate = businessDateForInstant(occurredAt);
  const state = await lockBusinessDayState(tx, businessDate);

  if (
    state.status === BusinessDayStatus.CLOSING ||
    state.status === BusinessDayStatus.SUBMITTED ||
    state.status === BusinessDayStatus.APPROVED
  ) {
    throw new BusinessDayPostingLockedException(
      state.status === BusinessDayStatus.APPROVED
        ? "This business day has already been approved. Management must reopen it before another transaction can be posted."
        : "This business day is being closed. Complete or cancel the close before another transaction can be posted.",
    );
  }

  return tx.businessDayState.update({
    where: { businessDate },
    data: {
      activityVersion: { increment: 1 },
      lastActivityAt: new Date(),
      status: state.status,
    },
  });
}
