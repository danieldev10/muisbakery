import assert from "node:assert/strict";
import { test } from "node:test";

import { HttpException, UnauthorizedException } from "@nestjs/common";
import { hashSync } from "bcryptjs";

import { AuthService } from "../src/auth/auth.service";

const PASSWORD = "correct-horse-battery";

function makeRequest() {
  return {
    ip: "192.168.1.20",
    headers: { "user-agent": "test-agent" },
  } as never;
}

function makeResponse() {
  const cookies: Record<string, string> = {};

  return {
    cookies,
    response: {
      cookie: (name: string, value: string) => {
        cookies[name] = value;
      },
      clearCookie: () => {},
    } as never,
  };
}

function makeService({
  emailFailures = 0,
  ipFailures = 0,
  user = null as Record<string, unknown> | null,
}) {
  const failureRecords: Record<string, unknown>[] = [];
  let findUniqueCalled = false;

  const prisma = {
    auditLog: {
      count: async (args: {
        where: { metadata?: unknown; ipAddress?: string };
      }) => (args.where.metadata ? emailFailures : ipFailures),
      create: async (args: { data: Record<string, unknown> }) => {
        failureRecords.push(args.data);
        return args.data;
      },
    },
    user: {
      findUnique: async () => {
        findUniqueCalled = true;
        return user;
      },
      update: async () => user,
    },
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        user: { update: async () => user },
        auditLog: { create: async () => ({}) },
      }),
  };

  const jwt = {
    signAsync: async () => "signed-token",
    verifyAsync: async () => ({ sub: "user-1" }),
  };

  return {
    service: new AuthService(prisma as never, jwt as never),
    failureRecords,
    wasUserLookedUp: () => findUniqueCalled,
  };
}

test("login is throttled after repeated failures for the same email", async () => {
  const { service, wasUserLookedUp } = makeService({ emailFailures: 5 });
  const { response } = makeResponse();

  await assert.rejects(
    service.login(
      { email: "admin@muisbakery.local", password: "wrong" },
      makeRequest(),
      response,
    ),
    (error) =>
      error instanceof HttpException &&
      error.getStatus() === 429 &&
      /Too many failed login attempts/.test(error.message),
  );
  assert.equal(wasUserLookedUp(), false);
});

test("login is throttled after too many failures from one IP", async () => {
  const { service } = makeService({ ipFailures: 30 });
  const { response } = makeResponse();

  await assert.rejects(
    service.login(
      { email: "someone@muisbakery.local", password: "wrong" },
      makeRequest(),
      response,
    ),
    (error) => error instanceof HttpException && error.getStatus() === 429,
  );
});

test("a wrong password records an AUTH_LOGIN_FAILED audit entry and stays generic", async () => {
  const { service, failureRecords } = makeService({
    user: {
      id: "user-1",
      name: "Admin",
      email: "admin@muisbakery.local",
      role: "ADMIN",
      isActive: true,
      passwordHash: hashSync(PASSWORD, 4),
    },
  });
  const { response } = makeResponse();

  await assert.rejects(
    service.login(
      { email: "admin@muisbakery.local", password: "wrong" },
      makeRequest(),
      response,
    ),
    (error) =>
      error instanceof UnauthorizedException &&
      error.message === "Invalid email or password.",
  );
  assert.equal(failureRecords.length, 1);
  assert.equal(failureRecords[0].action, "AUTH_LOGIN_FAILED");
  assert.equal(failureRecords[0].ipAddress, "192.168.1.20");
  assert.deepEqual(failureRecords[0].metadata, {
    email: "admin@muisbakery.local",
  });
});

test("an unknown email records a failure without revealing whether it exists", async () => {
  const { service, failureRecords } = makeService({ user: null });
  const { response } = makeResponse();

  await assert.rejects(
    service.login(
      { email: "ghost@muisbakery.local", password: "anything" },
      makeRequest(),
      response,
    ),
    (error) =>
      error instanceof UnauthorizedException &&
      error.message === "Invalid email or password.",
  );
  assert.equal(failureRecords.length, 1);
});

test("a valid login below the threshold still succeeds and sets the cookie", async () => {
  const { service, failureRecords } = makeService({
    emailFailures: 4,
    user: {
      id: "user-1",
      name: "Admin",
      email: "admin@muisbakery.local",
      role: "ADMIN",
      isActive: true,
      passwordHash: hashSync(PASSWORD, 4),
    },
  });
  const { cookies, response } = makeResponse();

  const result = await service.login(
    { email: "admin@muisbakery.local", password: PASSWORD },
    makeRequest(),
    response,
  );

  assert.equal(result.email, "admin@muisbakery.local");
  assert.equal(cookies.muisbakery_session, "signed-token");
  assert.equal(failureRecords.length, 0);
});
