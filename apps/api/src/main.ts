import "dotenv/config";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import {
  assertRequiredEnv,
  getInternalApiSecret,
  getWebOrigin,
  isWebOriginAllowed,
  isProduction,
} from "./config/env";
import { requestLoggingMiddleware } from "./common/request-logging.middleware";
import {
  rateLimitMiddleware,
  securityHeadersMiddleware,
  unsafeRequestOriginMiddleware,
} from "./security/security.middleware";

async function bootstrap() {
  assertRequiredEnv();

  const app = await NestFactory.create(AppModule);
  const webOrigin = getWebOrigin();
  const httpServer = app.getHttpAdapter().getInstance();

  if (typeof httpServer.disable === "function") {
    httpServer.disable("x-powered-by");
  }

  if (isProduction() && typeof httpServer.set === "function") {
    httpServer.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
  }

  app.use(
    securityHeadersMiddleware({
      enableHsts: isProduction(),
    }),
  );
  app.use(
    unsafeRequestOriginMiddleware({
      internalSecret: getInternalApiSecret(),
      requireTrustedSource: isProduction(),
      webOrigin,
    }),
  );
  app.use(requestLoggingMiddleware);
  // Public customer-display lookups are unauthenticated; cap bursts per IP
  // so display tokens cannot be probed quickly.
  app.use(
    "/sales/pos/display",
    rateLimitMiddleware({ windowMs: 60_000, max: 120 }),
  );

  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      callback(null, isWebOriginAllowed(origin));
    },
    credentials: true,
  });

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port);

  console.log(`Muis Bakery API listening on http://localhost:${port}`);
}

void bootstrap();
