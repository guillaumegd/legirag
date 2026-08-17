import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { ExecutionTrace } from '@legirag/shared';
import { fetchTrace } from '@legirag/retrieval';

@Controller('trace')
export class TraceController {
  @Get(':traceId')
  async getById(@Param('traceId') traceId: string): Promise<ExecutionTrace> {
    const trace = await fetchTrace(traceId);
    if (trace === undefined) {
      throw new NotFoundException(`Trace introuvable : ${traceId}`);
    }
    return trace;
  }
}
