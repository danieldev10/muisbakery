import assert from "node:assert/strict";
import { test } from "node:test";

import {
  internalApiSecretHeader,
  isUnsafeMethod,
  isUnsafeRequestAllowed,
  rateLimitMiddleware,
} from "../src/security/security.middleware";

const OPTIONS = {
  internalSecret: "a".repeat(32),
  requireTrustedSource: true,
  webOrigin: "https://bakery.example.com",
};

function request(method: string, headers: Record<string, string> = {}) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    method,
    get: (name: string) => normalized.get(name.toLowerCase()),
  };
}

test("unsafe method detection covers writes but not reads", () => {
  assert.equal(isUnsafeMethod("GET"), false);
  assert.equal(isUnsafeMethod("HEAD"), false);
  assert.equal(isUnsafeMethod("OPTIONS"), false);
  assert.equal(isUnsafeMethod("POST"), true);
  assert.equal(isUnsafeMethod("patch"), true);
  assert.equal(isUnsafeMethod("DELETE"), true);
});

test("same-origin unsafe requests are allowed", () => {
  assert.equal(
    isUnsafeRequestAllowed(
      request("POST", { origin: "https://bakery.example.com" }),
      OPTIONS,
    ),
    true,
  );
  assert.equal(
    isUnsafeRequestAllowed(
      request("PATCH", { referer: "https://bakery.example.com/admin/users" }),
      OPTIONS,
    ),
    true,
  );
});

test("trusted server-to-server unsafe requests are allowed without origin", () => {
  assert.equal(
    isUnsafeRequestAllowed(
      request("POST", { [internalApiSecretHeader]: "a".repeat(32) }),
      OPTIONS,
    ),
    true,
  );
});

test("cross-origin unsafe requests are rejected", () => {
  assert.equal(
    isUnsafeRequestAllowed(
      request("POST", { origin: "https://attacker.example.com" }),
      OPTIONS,
    ),
    false,
  );
  assert.equal(
    isUnsafeRequestAllowed(
      request("POST", { [internalApiSecretHeader]: "wrong-secret" }),
      OPTIONS,
    ),
    false,
  );
  assert.equal(isUnsafeRequestAllowed(request("POST"), OPTIONS), false);
});

test("development can allow no-origin local server calls", () => {
  assert.equal(
    isUnsafeRequestAllowed(request("POST"), {
      internalSecret: null,
      requireTrustedSource: false,
      webOrigin: "http://localhost:3000",
    }),
    true,
  );
});

test("public token rate limiter caps bursts per client IP", () => {
  const middleware = rateLimitMiddleware({ windowMs: 60_000, max: 2 });
  let allowed = 0;
  const next = () => {
    allowed += 1;
  };
  const makeResponse = () => {
    const response = {
      statusCode: 200,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };

    return response;
  };

  middleware({ ip: "192.0.2.10" } as never, makeResponse() as never, next);
  middleware({ ip: "192.0.2.10" } as never, makeResponse() as never, next);

  const blocked = makeResponse();
  middleware({ ip: "192.0.2.10" } as never, blocked as never, next);

  assert.equal(allowed, 2);
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, {
    message: "Too many requests. Try again shortly.",
  });
});
