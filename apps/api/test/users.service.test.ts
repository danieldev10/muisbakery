import assert from "node:assert/strict";
import { test } from "node:test";

import { ConflictException } from "@nestjs/common";

import { UsersService } from "../src/admin/users/users.service";
import { actor, createAuditMock } from "./helpers";

test("UsersService.update can change a user's email address", async () => {
  const now = new Date("2026-07-11T09:00:00.000Z");
  let updateData: Record<string, unknown> | null = null;
  const { audit, records } = createAuditMock();
  const service = new UsersService(
    {
      user: {
        findUnique: async () => ({
          id: "user-2",
          name: "Sales Rep",
          email: "sales.rep@muisbakery.local",
          role: "SALES",
          isActive: true,
          lastLoginAt: null,
          createdAt: now,
        }),
        findFirst: async () => null,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return {
            id: "user-2",
            name: "Sales Lead",
            email: data.email,
            role: "SALES",
            isActive: true,
            lastLoginAt: null,
            createdAt: now,
          };
        },
      },
    } as never,
    audit as never,
  );

  const result = await service.update(
    "user-2",
    {
      name: "Sales Lead",
      email: "SALES.LEAD@MUISBAKERY.LOCAL",
      role: "SALES",
      isActive: true,
    },
    actor,
  );

  assert.equal(updateData?.email, "sales.lead@muisbakery.local");
  assert.equal(result.email, "sales.lead@muisbakery.local");
  assert.equal(records.length, 1);
  assert.deepEqual((records[0] as { metadata: unknown }).metadata, {
    email: "sales.lead@muisbakery.local",
    role: "SALES",
    isActive: true,
    passwordChanged: false,
    before: {
      name: "Sales Rep",
      email: "sales.rep@muisbakery.local",
      role: "SALES",
      isActive: true,
    },
    after: {
      name: "Sales Lead",
      email: "sales.lead@muisbakery.local",
      role: "SALES",
      isActive: true,
    },
  });
});

test("UsersService.update rejects duplicate email addresses", async () => {
  const { audit } = createAuditMock();
  const service = new UsersService(
    {
      user: {
        findUnique: async () => ({ id: "user-2", role: "SALES" }),
        findFirst: async () => ({ id: "user-3" }),
      },
    } as never,
    audit as never,
  );

  await assert.rejects(
    service.update(
      "user-2",
      { email: "existing@muisbakery.local" },
      actor,
    ),
    (error) =>
      error instanceof ConflictException &&
      /email already exists/i.test(error.message),
  );
});
