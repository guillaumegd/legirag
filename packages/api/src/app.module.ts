import { Module } from '@nestjs/common';
import { ArticleModule } from './article/article.module.js';
import { HealthController } from './health/health.controller.js';
import { QuestionModule } from './question/question.module.js';
import { TraceModule } from './trace/trace.module.js';

@Module({
  imports: [QuestionModule, ArticleModule, TraceModule],
  controllers: [HealthController],
})
export class AppModule {}
