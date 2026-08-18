import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // API publique et anonyme (pas de compte, pas de cookie de session -
  // project-overview.md), donc pas d'origine à restreindre pour l'instant.
  app.enableCors();
  app.useGlobalFilters(new AllExceptionsFilter());
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error("Échec du démarrage de l'API :", error);
  process.exitCode = 1;
});
