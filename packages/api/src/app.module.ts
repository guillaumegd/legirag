import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenGuard } from './common/access-token.guard.js';
import { PersistentRateLimitGuard } from './common/persistent-rate-limit.guard.js';
import { ArticleModule } from './article/article.module.js';
import { HealthController } from './health/health.controller.js';
import { QuestionModule } from './question/question.module.js';
import { TraceModule } from './trace/trace.module.js';

@Module({
  imports: [QuestionModule, ArticleModule, TraceModule],
  controllers: [HealthController],
  providers: [
    // Ordre voulu : le token avant le rate-limit, pour qu'une requête non
    // authentifiée ne consomme pas de budget (packages/api/src/common/*.guard.ts).
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: PersistentRateLimitGuard },
  ],
})
export class AppModule {}
