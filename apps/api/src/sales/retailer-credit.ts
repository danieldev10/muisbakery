import { ConflictException } from "@nestjs/common";
import {
  Prisma,
  RetailerOrderApprovalStatus,
} from "@prisma/client";

type RetailerApprovalTransaction = Pick<
  Prisma.TransactionClient,
  "retailerOrderApproval"
>;

export async function consumeRetailerOrderApproval(
  tx: RetailerApprovalTransaction,
  approvalId: string,
  usedAt = new Date(),
) {
  const consumed = await tx.retailerOrderApproval.updateMany({
    where: {
      id: approvalId,
      status: RetailerOrderApprovalStatus.APPROVED,
      usedAt: null,
    },
    data: {
      status: RetailerOrderApprovalStatus.USED,
      usedAt,
    },
  });

  if (consumed.count !== 1) {
    throw new ConflictException(
      "This retailer approval was consumed by another sale. Refresh and request another approval.",
    );
  }
}
