import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const logger = new Logger("Http");

export function requestLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const startedAt = Date.now();

  response.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const message = `${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs}ms ip=${request.ip}`;

    if (response.statusCode >= 500) {
      logger.error(message);
      return;
    }

    if (response.statusCode >= 400) {
      logger.warn(message);
      return;
    }

    logger.log(message);
  });

  next();
}
