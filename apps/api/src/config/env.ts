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

function normalizedHostname(url: URL) {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);

  if (
    octets.length !== 4 ||
    octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
    )
  ) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    // Tailscale addresses use the shared 100.64.0.0/10 range.
    (first === 100 && second >= 64 && second <= 127)
  );
}

/**
 * Production remains pinned to WEB_ORIGIN. The local Docker profile is also
 * opened from another device by LAN/Tailscale IP, so development accepts the
 * same web port on loopback and private-network addresses without requiring a
 * machine-specific .env file.
 */
export function isWebOriginAllowed(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  let candidate: URL;

  try {
    candidate = new URL(origin);
  } catch {
    return false;
  }

  if (candidate.origin === getWebOrigin()) {
    return true;
  }

  if (isProduction()) {
    return false;
  }

  const configured = new URL(getWebOrigin());
  const configuredPort =
    configured.port || (configured.protocol === "https:" ? "443" : "80");
  const candidatePort =
    candidate.port || (candidate.protocol === "https:" ? "443" : "80");
  const hostname = normalizedHostname(candidate);

  return (
    candidate.protocol === "http:" &&
    candidatePort === configuredPort &&
    (hostname === "localhost" ||
      hostname === "::1" ||
      isPrivateIpv4(hostname))
  );
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

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export function getSmtpConfig(): SmtpConfig | null {
  const values = {
    host: process.env.SMTP_HOST?.trim(),
    port: process.env.SMTP_PORT?.trim(),
    secure: process.env.SMTP_SECURE?.trim(),
    user: process.env.SMTP_USER?.trim(),
    password: process.env.SMTP_PASSWORD?.trim(),
    from: process.env.SMTP_FROM?.trim(),
  };
  const configured = Object.values(values).filter(Boolean).length;

  if (configured === 0) {
    return null;
  }

  if (configured !== Object.keys(values).length) {
    throw new Error(
      "SMTP configuration is incomplete. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM together.",
    );
  }

  const port = Number(values.port);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535.");
  }

  if (values.secure !== "true" && values.secure !== "false") {
    throw new Error("SMTP_SECURE must be either true or false.");
  }

  return {
    host: values.host!,
    port,
    secure: values.secure === "true",
    user: values.user!,
    password: values.password!,
    from: values.from!,
  };
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
  getSmtpConfig();
}
