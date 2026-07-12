import { timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export const internalApiSecretHeader = "x-muisbakery-internal-secret";

const unsafeMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

type HeaderReader = {
  get(name: string): string | undefined;
  method: string;
};

type UnsafeRequestOptions = {
  internalSecret: string | null;
  requireTrustedSource: boolean;
  webOrigin: string;
};

type SecurityHeaderOptions = {
  enableHsts: boolean;
};

function headerValue(request: HeaderReader, name: string) {
  return request.get(name)?.trim() ?? "";
}

function normalizeOrigin(value: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function secretMatches(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isUnsafeMethod(method: string) {
  return unsafeMethods.has(method.toUpperCase());
}

export function isUnsafeRequestAllowed(
  request: HeaderReader,
  options: UnsafeRequestOptions,
) {
  if (!isUnsafeMethod(request.method)) {
    return true;
  }

  const internalHeader = headerValue(request, internalApiSecretHeader);

  if (
    options.internalSecret &&
    internalHeader &&
    secretMatches(internalHeader, options.internalSecret)
  ) {
    return true;
  }

  const origin = headerValue(request, "origin");
  const referer = headerValue(request, "referer");
  const originToCheck = origin || referer;

  if (originToCheck) {
    return normalizeOrigin(originToCheck) === options.webOrigin;
  }

  return !options.requireTrustedSource;
}

export function securityHeadersMiddleware(options: SecurityHeaderOptions) {
  return (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    if (options.enableHsts) {
      response.setHeader(
        "Strict-Transport-Security",
        "max-age=15552000; includeSubDomains",
      );
    }

    next();
  };
}

type RateLimitOptions = {
  windowMs: number;
  max: number;
};

/**
 * Small fixed-window limiter for the public display-token lookups. Keyed by
 * client IP; state is in-memory because a burst limiter only needs to slow
 * token guessing, not survive restarts.
 */
export function rateLimitMiddleware(options: RateLimitOptions) {
  const hits = new Map<string, { count: number; windowStart: number }>();

  return (request: Request, response: Response, next: NextFunction) => {
    const now = Date.now();
    const key = request.ip ?? "unknown";
    const entry = hits.get(key);

    if (!entry || now - entry.windowStart >= options.windowMs) {
      hits.set(key, { count: 1, windowStart: now });

      // Sweep stale windows so the map cannot grow unbounded.
      if (hits.size > 10_000) {
        for (const [hitKey, hit] of hits) {
          if (now - hit.windowStart >= options.windowMs) {
            hits.delete(hitKey);
          }
        }
      }

      next();
      return;
    }

    entry.count += 1;

    if (entry.count > options.max) {
      response.status(429).json({
        message: "Too many requests. Try again shortly.",
      });
      return;
    }

    next();
  };
}

export function unsafeRequestOriginMiddleware(options: UnsafeRequestOptions) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (isUnsafeRequestAllowed(request, options)) {
      next();
      return;
    }

    response.status(403).json({
      message: "Request origin is not allowed.",
    });
  };
}
