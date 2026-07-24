import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertRequiredEnv,
  getInternalApiSecret,
  getJwtSecret,
  getSmtpConfig,
  getWebOrigin,
  isWebOriginAllowed,
} from "../src/config/env";

const ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_JWT_SECRET",
  "AUTH_SECRET",
  "INTERNAL_API_SECRET",
  "WEB_ORIGIN",
  "NODE_ENV",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
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

test("development permits loopback, LAN, and Tailscale web origins", () => {
  withEnv({}, () => {
    assert.equal(isWebOriginAllowed(undefined), true);
    assert.equal(isWebOriginAllowed("http://localhost:3000"), true);
    assert.equal(isWebOriginAllowed("http://127.0.0.1:3000"), true);
    assert.equal(isWebOriginAllowed("http://192.168.1.15:3000"), true);
    assert.equal(isWebOriginAllowed("http://10.0.0.20:3000"), true);
    assert.equal(isWebOriginAllowed("http://100.100.10.20:3000"), true);
    assert.equal(isWebOriginAllowed("http://192.168.1.15:3002"), false);
    assert.equal(isWebOriginAllowed("https://attacker.example.com"), false);
    assert.equal(isWebOriginAllowed("not an origin"), false);
  });
});

test("production only permits the configured web origin", () => {
  withEnv(
    {
      NODE_ENV: "production",
      WEB_ORIGIN: "https://bakery.example.com",
    },
    () => {
      assert.equal(isWebOriginAllowed("https://bakery.example.com"), true);
      assert.equal(isWebOriginAllowed("http://192.168.1.15:3000"), false);
      assert.equal(isWebOriginAllowed("https://attacker.example.com"), false);
    },
  );
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

test("SMTP configuration is optional but must be complete when enabled", () => {
  withEnv({}, () => {
    assert.equal(getSmtpConfig(), null);
  });
  withEnv({ SMTP_HOST: "smtp.example.com" }, () => {
    assert.throws(getSmtpConfig, /SMTP configuration is incomplete/);
  });
  withEnv(
    {
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "mailer@example.com",
      SMTP_PASSWORD: "app-password",
      SMTP_FROM: "Muis Bakery <mailer@example.com>",
    },
    () => {
      assert.deepEqual(getSmtpConfig(), {
        host: "smtp.example.com",
        port: 465,
        secure: true,
        user: "mailer@example.com",
        password: "app-password",
        from: "Muis Bakery <mailer@example.com>",
      });
    },
  );
});
