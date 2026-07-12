import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertRequiredEnv,
  getInternalApiSecret,
  getJwtSecret,
  getWebOrigin,
} from "../src/config/env";

const ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_JWT_SECRET",
  "AUTH_SECRET",
  "INTERNAL_API_SECRET",
  "WEB_ORIGIN",
  "NODE_ENV",
] as const;

function withEnv(overrides: Record<string, string | undefined>, run: () => void) {
  const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("assertRequiredEnv lists every missing variable and refuses to start", () => {
  withEnv({}, () => {
    assert.throws(assertRequiredEnv, /DATABASE_URL.*AUTH_JWT_SECRET.*Refusing to start/s);
  });
});

test("assertRequiredEnv accepts a complete development configuration", () => {
  withEnv(
    { DATABASE_URL: "postgresql://localhost/db", AUTH_JWT_SECRET: "dev-secret" },
    () => {
      assert.doesNotThrow(assertRequiredEnv);
    },
  );
});

test("assertRequiredEnv requires WEB_ORIGIN and a long secret in production", () => {
  withEnv(
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost/db",
      AUTH_JWT_SECRET: "short",
      INTERNAL_API_SECRET: "b".repeat(32),
      WEB_ORIGIN: "https://bakery.example.com",
    },
    () => {
      assert.throws(assertRequiredEnv, /at least 32 characters/);
    },
  );

  withEnv(
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost/db",
      AUTH_JWT_SECRET: "a".repeat(32),
      INTERNAL_API_SECRET: "b".repeat(32),
    },
    () => {
      assert.throws(assertRequiredEnv, /WEB_ORIGIN/);
    },
  );

  withEnv(
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost/db",
      AUTH_JWT_SECRET: "a".repeat(32),
      WEB_ORIGIN: "https://bakery.example.com",
    },
    () => {
      assert.throws(assertRequiredEnv, /INTERNAL_API_SECRET/);
    },
  );

  withEnv(
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost/db",
      AUTH_JWT_SECRET: "a".repeat(32),
      INTERNAL_API_SECRET: "short",
      WEB_ORIGIN: "https://bakery.example.com",
    },
    () => {
      assert.throws(assertRequiredEnv, /INTERNAL_API_SECRET must be at least 32/);
    },
  );
});

test("getJwtSecret throws instead of signing tokens with an empty secret", () => {
  withEnv({}, () => {
    assert.throws(getJwtSecret, /Refusing to start without a signing secret/);
  });
  withEnv({ AUTH_SECRET: "fallback-secret" }, () => {
    assert.equal(getJwtSecret(), "fallback-secret");
  });
});

test("getWebOrigin falls back to the local dev origin", () => {
  withEnv({}, () => {
    assert.equal(getWebOrigin(), "http://localhost:3000");
  });
  withEnv({ WEB_ORIGIN: "https://bakery.example.com" }, () => {
    assert.equal(getWebOrigin(), "https://bakery.example.com");
  });
});

test("getWebOrigin rejects malformed or path-based origins", () => {
  withEnv({ WEB_ORIGIN: "not a url" }, () => {
    assert.throws(getWebOrigin, /valid URL origin/);
  });
  withEnv({ WEB_ORIGIN: "https://bakery.example.com/app" }, () => {
    assert.throws(getWebOrigin, /not a full URL path/);
  });
});

test("getInternalApiSecret is optional in development and required in production", () => {
  withEnv({}, () => {
    assert.equal(getInternalApiSecret(), null);
  });
  withEnv({ INTERNAL_API_SECRET: "dev-internal-secret" }, () => {
    assert.equal(getInternalApiSecret(), "dev-internal-secret");
  });
  withEnv({ NODE_ENV: "production" }, () => {
    assert.throws(getInternalApiSecret, /server-to-server API secret/);
  });
});
