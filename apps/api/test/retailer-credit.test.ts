import assert from "node:assert/strict";
import { test } from "node:test";

import { ConflictException } from "@nestjs/common";

import { consumeRetailerOrderApproval } from "../src/sales/retailer-credit";

test("only one concurrent synchronization can consume a retailer approval", async () => {
  let approvalStatus = "APPROVED";
  let usedAt: Date | null = null;
  const tx = {
    retailerOrderApproval: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { status: string; usedAt: null };
        data: { status: string; usedAt: Date };
      }) => {
        if (
          approvalStatus !== where.status ||
          usedAt !== where.usedAt
        ) {
          return { count: 0 };
        }

        approvalStatus = data.status;
        usedAt = data.usedAt;
        return { count: 1 };
      },
    },
  };

  const attempts = await Promise.allSettled([
    consumeRetailerOrderApproval(tx as never, "approval-1"),
    consumeRetailerOrderApproval(tx as never, "approval-1"),
  ]);
  const fulfilled = attempts.filter(
    (attempt) => attempt.status === "fulfilled",
  );
  const rejected = attempts.filter(
    (attempt): attempt is PromiseRejectedResult =>
      attempt.status === "rejected",
  );

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.reason instanceof ConflictException);
  assert.equal(approvalStatus, "USED");
  assert.ok(usedAt instanceof Date);
});
