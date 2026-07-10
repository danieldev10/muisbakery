import "dotenv/config";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { assertRequiredEnv, getWebOrigin } from "./config/env";

async function bootstrap() {
  assertRequiredEnv();

  const app = await NestFactory.create(AppModule);
  const webOrigin = getWebOrigin();

  app.enableCors({
    origin: webOrigin,
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
  await app.listen(port);

  console.log(`Muis Bakery API listening on http://localhost:${port}`);
}

void bootstrap();
