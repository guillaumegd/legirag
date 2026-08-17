import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { QuestionModule } from './question/question.module.js';

@Module({
  imports: [QuestionModule],
  controllers: [HealthController],
})
export class AppModule {}
