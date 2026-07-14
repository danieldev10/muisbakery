const LOCAL_TEST_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export type SafeTestDatabase = {
  databaseName: string;
  url: string;
};

export function assertSafeTestDatabaseUrl(value: string): SafeTestDatabase {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("TEST_DATABASE_URL must use the postgresql:// protocol.");
  }

  if (!LOCAL_TEST_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing test database host \"${url.hostname}\". Phase 8 tests may only use local PostgreSQL.`,
    );
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (!/^[a-zA-Z0-9_]+_test$/.test(databaseName)) {
    throw new Error(
      `Refusing database \"${databaseName || "(missing)"}\". The test database name must end in _test.`,
    );
  }

  return {
    databaseName,
    url: url.toString(),
  };
}

export function defaultLocalTestDatabaseUrl() {
  const username = encodeURIComponent(process.env.USER?.trim() || "postgres");
  return `postgresql://${username}@127.0.0.1:5432/muisbakery_test?schema=public`;
}

