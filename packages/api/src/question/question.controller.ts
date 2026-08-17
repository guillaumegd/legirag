import { randomUUID } from 'node:crypto';
import { Body, Controller, Inject, Post, Res, UseGuards, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { buildFixedChainGraph } from '@legirag/agent';
import { CostGuardService } from './cost-guard.service.js';
import { DailyCostCapGuard } from './daily-cost-cap.guard.js';
import { QuestionRequestSchema, type QuestionRequest } from './question.dto.js';
import { streamQuestionToSink } from './stream-question.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

@Controller('question')
export class QuestionController {
  constructor(@Inject(CostGuardService) private readonly costGuardService: CostGuardService) {}

  @Post()
  @UseGuards(DailyCostCapGuard)
  @UsePipes(new ZodValidationPipe(QuestionRequestSchema))
  async ask(@Body() body: QuestionRequest, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const input = {
      question: body.question,
      dateReference: body.dateReference !== undefined ? new Date(body.dateReference) : new Date(),
      codes: body.codes,
      traceId: randomUUID(),
      reponse: undefined,
    };

    await streamQuestionToSink(() => buildFixedChainGraph(), input, res, undefined, (tokenUsage) =>
      this.costGuardService.recordUsage(tokenUsage),
    );
  }
}
