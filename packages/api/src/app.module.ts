import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ArticleModule } from './article/article.module.js';
import { HealthController } from './health/health.controller.js';
import { QuestionModule } from './question/question.module.js';
import { TraceModule } from './trace/trace.module.js';

// Limite fixe (pas de variable d'env) - même raisonnement que
// MAX_RENVOI_ITERATIONS/TOP_K dans packages/agent : une constante de code,
// pas un réglage opérationnel exposé. 20 req/min/IP, stockage en mémoire
// (défaut du package) - correct uniquement pour le déploiement mono-
// processus visé par l'item 11d, pas pour plusieurs instances.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: RATE_LIMIT_WINDOW_MS, limit: RATE_LIMIT_MAX_REQUESTS }]),
    QuestionModule,
    ArticleModule,
    TraceModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
