import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { ExecutionTrace } from '@legirag/shared';
import { fetchTrace } from '@legirag/retrieval';
import { FreeRead } from '../common/free-read.decorator.js';

@Controller('trace')
export class TraceController {
  @Get(':traceId')
  @FreeRead()
  async getById(@Param('traceId') traceId: string): Promise<ExecutionTrace> {
    const trace = await fetchTrace(traceId);
    if (trace === undefined) {
      throw new NotFoundException(`Trace introuvable : ${traceId}`);
    }
    return trace;
  }
}
