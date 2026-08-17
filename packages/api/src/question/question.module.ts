import { Module } from '@nestjs/common';
import { QuestionController } from './question.controller.js';

@Module({
  controllers: [QuestionController],
})
export class QuestionModule {}
