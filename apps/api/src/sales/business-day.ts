import { ConflictException } from "@nestjs/common";
import { BusinessDayStatus, Prisma } from "@prisma/client";

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
  await tx.businessDayState.upsert({
    where: { businessDate },
    create: { businessDate },
    update: {},
  });
  await tx.$queryRaw(
    Prisma.sql`SELECT "businessDate" FROM "BusinessDayState" WHERE "businessDate" = ${businessDate} FOR UPDATE`,
  );

  return tx.businessDayState.findUniqueOrThrow({
    where: { businessDate },
  });
}

export async function recordBusinessDayActivity(
  tx: Prisma.TransactionClient,
  occurredAt: Date,
) {
  const businessDate = businessDateForInstant(occurredAt);
  const state = await lockBusinessDayState(tx, businessDate);

  if (state.status === BusinessDayStatus.APPROVED) {
    throw new ConflictException(
      "This business day has already been approved. Management must reopen it before another transaction can be posted.",
    );
  }

  const status =
    state.status === BusinessDayStatus.SUBMITTED
      ? BusinessDayStatus.STALE
      : state.status;

  return tx.businessDayState.update({
    where: { businessDate },
    data: {
      activityVersion: { increment: 1 },
      lastActivityAt: new Date(),
      status,
    },
  });
}
