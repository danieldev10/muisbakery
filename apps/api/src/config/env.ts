/**
 * Environment validation. The API must refuse to boot with an unsafe or
 * incomplete configuration instead of limping along with silent fallbacks.
 */

const MIN_PRODUCTION_SECRET_LENGTH = 32;

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

export function getWebOrigin() {
  return process.env.WEB_ORIGIN ?? "http://localhost:3000";
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

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Refusing to start.`,
    );
  }

  // Applies the production length check even when the variable is present.
  getJwtSecret();
}
