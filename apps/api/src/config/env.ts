/**
 * Environment validation. The API must refuse to boot with an unsafe or
 * incomplete configuration instead of limping along with silent fallbacks.
 */

const MIN_PRODUCTION_SECRET_LENGTH = 32;
const MIN_INTERNAL_SECRET_LENGTH = 32;

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getJwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET ?? process.env.AUTH_SECRET;

  if (!secret || secret.trim() === "") {
    throw new Error(
      "AUTH_JWT_SECRET (or AUTH_SECRET) is not set. Refusing to start without a signing secret.",
    );
  }

  if (isProduction() && secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
    throw new Error(
      `AUTH_JWT_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`,
    );
  }

  return secret;
}

function parseOrigin(value: string, variableName: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid URL origin.`);
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${variableName} must be an origin, not a full URL path.`);
  }

  if (isProduction() && url.protocol !== "https:") {
    throw new Error(`${variableName} must use https in production.`);
  }

  return url.origin;
}

export function getWebOrigin() {
  return parseOrigin(process.env.WEB_ORIGIN ?? "http://localhost:3000", "WEB_ORIGIN");
}

export function getInternalApiSecret() {
  const secret = process.env.INTERNAL_API_SECRET;

  if (!secret || secret.trim() === "") {
    if (isProduction()) {
      throw new Error(
        "INTERNAL_API_SECRET is not set. Refusing to start without a server-to-server API secret.",
      );
    }

    return null;
  }

  if (isProduction() && secret.length < MIN_INTERNAL_SECRET_LENGTH) {
    throw new Error(
      `INTERNAL_API_SECRET must be at least ${MIN_INTERNAL_SECRET_LENGTH} characters in production.`,
    );
  }

  return secret;
}

export function assertRequiredEnv() {
  const missing: string[] = [];

  if (!process.env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }

  if (!process.env.AUTH_JWT_SECRET && !process.env.AUTH_SECRET) {
    missing.push("AUTH_JWT_SECRET");
  }

  if (isProduction() && !process.env.WEB_ORIGIN) {
    missing.push("WEB_ORIGIN");
  }

  if (isProduction() && !process.env.INTERNAL_API_SECRET) {
    missing.push("INTERNAL_API_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Refusing to start.`,
    );
  }

  // Applies the production length check even when the variable is present.
  getJwtSecret();
  getWebOrigin();
  getInternalApiSecret();
}
