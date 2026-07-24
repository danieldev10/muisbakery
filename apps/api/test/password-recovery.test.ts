import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";
import { hashSync } from "bcryptjs";

import { PasswordRecoveryService } from "../src/auth/password-recovery.service";

const SECRET = "password-recovery-test-secret";
const request = {
  ip: "192.168.1.25",
  headers: { "user-agent": "recovery-test" },
} as never;

function codeHash(userId: string, code: string) {
  return createHmac("sha256", SECRET)
    .update(`${userId}:${code}`)
    .digest("hex");
}

test("password recovery stays generic for unknown accounts", async () => {
  const sent: unknown[] = [];
  const service = new PasswordRecoveryService(
    {
      user: { findUnique: async () => null },
    } as never,
    {
      sendPasswordResetCode: async (message: unknown) => sent.push(message),
    } as never,
  );
  const originalSecret = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = SECRET;

  try {
    const result = await service.requestCode(
      { email: "unknown@example.com" },
      request,
    );

    assert.match(result.message, /If the account can be recovered/);
    assert.equal(sent.length, 0);
  } finally {
    if (originalSecret === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = originalSecret;
  }
});

test("password recovery stores a hash and emails an eight-digit code", async () => {
  let storedHash = "";
  let deliveredCode = "";
  const resetTokens = {
    count: async () => 0,
    updateMany: async () => ({ count: 0 }),
    create: async ({ data }: { data: { codeHash: string } }) => {
      storedHash = data.codeHash;
      return { id: "token-1", ...data };
    },
  };
  const service = new PasswordRecoveryService(
    {
      user: {
        findUnique: async () => ({
          id: "user-1",
          name: "Admin",
          recoveryEmail: "admin@example.com",
          isActive: true,
        }),
      },
      passwordResetToken: resetTokens,
      auditLog: { create: async () => ({}) },
      $transaction: async (callback: (transaction: unknown) => unknown) =>
        callback({
          $queryRaw: async () => [{ id: "user-1" }],
          passwordResetToken: resetTokens,
        }),
    } as never,
    {
      sendPasswordResetCode: async ({ code }: { code: string }) => {
        deliveredCode = code;
      },
    } as never,
  );
  const originalSecret = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = SECRET;

  try {
    await service.requestCode({ email: "ADMIN@MUISBAKERY.LOCAL" }, request);

    assert.match(deliveredCode, /^\d{8}$/);
    assert.notEqual(storedHash, deliveredCode);
    assert.equal(storedHash, codeHash("user-1", deliveredCode));
  } finally {
    if (originalSecret === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = originalSecret;
  }
});

test("a recovery code is consumed once and invalidates existing sessions", async () => {
  const code = "12345678";
  const token = {
    id: "token-1",
    userId: "user-1",
    codeHash: codeHash("user-1", code),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null as Date | null,
    failedAttempts: 0,
    createdAt: new Date(),
  };
  let userUpdate: Record<string, unknown> | null = null;
  const auditRecords: Record<string, unknown>[] = [];
  const resetTokens = {
    findFirst: async () => (token.usedAt ? null : token),
    updateMany: async ({ where, data }: {
      where: { id?: string; usedAt?: null; userId?: string };
      data: Record<string, unknown>;
    }) => {
      if (where.id === token.id && where.usedAt === null) {
        if (token.usedAt) return { count: 0 };
        if (data.usedAt instanceof Date) token.usedAt = data.usedAt;
        return { count: 1 };
      }
      return { count: 0 };
    },
  };
  const transaction = {
    passwordResetToken: resetTokens,
    user: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        userUpdate = data;
        return {};
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditRecords.push(data);
        return data;
      },
    },
  };
  const service = new PasswordRecoveryService(
    {
      user: {
        findUnique: async () => ({
          id: "user-1",
          isActive: true,
          passwordHash: hashSync("existing-password", 4),
        }),
      },
      passwordResetToken: resetTokens,
      auditLog: transaction.auditLog,
      $transaction: async (callback: (tx: unknown) => unknown) =>
        callback(transaction),
    } as never,
    {} as never,
  );
  const originalSecret = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = SECRET;

  try {
    const result = await service.confirmReset(
      {
        email: "admin@muisbakery.local",
        code,
        password: "new-password-with-12-characters",
      },
      request,
    );

    assert.equal(result.ok, true);
    assert.ok(token.usedAt instanceof Date);
    assert.equal(typeof userUpdate?.passwordHash, "string");
    assert.deepEqual(userUpdate?.authVersion, { increment: 1 });
    assert.equal(auditRecords[0]?.action, "AUTH_PASSWORD_RESET_COMPLETED");

    await assert.rejects(
      service.confirmReset(
        {
          email: "admin@muisbakery.local",
          code,
          password: "another-password-with-12-characters",
        },
        request,
      ),
      (error) =>
        error instanceof BadRequestException &&
        error.message === "Invalid or expired recovery code.",
    );
  } finally {
    if (originalSecret === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = originalSecret;
  }
});
