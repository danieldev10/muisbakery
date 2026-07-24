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
          recoveryEmail: "sales.rep@example.com",
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
            recoveryEmail: data.recoveryEmail,
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
      recoveryEmail: "SALES.LEAD@EXAMPLE.COM",
      role: "SALES",
      isActive: true,
    },
    actor,
  );

  assert.equal(updateData?.email, "sales.lead@muisbakery.local");
  assert.equal(result.email, "sales.lead@muisbakery.local");
  assert.equal(result.recoveryEmail, "sales.lead@example.com");
  assert.equal(records.length, 1);
  assert.deepEqual((records[0] as { metadata: unknown }).metadata, {
    email: "sales.lead@muisbakery.local",
    recoveryEmail: "sales.lead@example.com",
    role: "SALES",
    isActive: true,
    passwordChanged: false,
    before: {
      name: "Sales Rep",
      email: "sales.rep@muisbakery.local",
      recoveryEmail: "sales.rep@example.com",
      role: "SALES",
      isActive: true,
    },
    after: {
      name: "Sales Lead",
      email: "sales.lead@muisbakery.local",
      recoveryEmail: "sales.lead@example.com",
      role: "SALES",
      isActive: true,
    },
  });
});

test("UsersService.update invalidates sessions when Admin resets a password", async () => {
  let updateData: Record<string, unknown> | null = null;
  const { audit } = createAuditMock();
  const service = new UsersService(
    {
      user: {
        findUnique: async () => ({
          id: "user-2",
          name: "Sales Rep",
          email: "sales@muisbakery.local",
          recoveryEmail: "sales@example.com",
          role: "SALES",
          isActive: true,
          lastLoginAt: null,
          createdAt: new Date(),
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return {
            id: "user-2",
            name: "Sales Rep",
            email: "sales@muisbakery.local",
            recoveryEmail: "sales@example.com",
            role: "SALES",
            isActive: true,
            lastLoginAt: null,
            createdAt: new Date(),
          };
        },
      },
    } as never,
    audit as never,
  );

  await service.update(
    "user-2",
    { password: "new-secure-password" },
    actor,
  );

  assert.equal(typeof updateData?.passwordHash, "string");
  assert.deepEqual(updateData?.authVersion, { increment: 1 });
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
