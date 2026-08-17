import { Module } from '@nestjs/common';
import { CostGuardService } from './cost-guard.service.js';
import { DailyCostCapGuard } from './daily-cost-cap.guard.js';
import { QuestionController } from './question.controller.js';

@Module({
  controllers: [QuestionController],
  providers: [CostGuardService, DailyCostCapGuard],
})
export class QuestionModule {}
