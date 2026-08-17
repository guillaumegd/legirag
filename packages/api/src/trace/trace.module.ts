import { Module } from '@nestjs/common';
import { TraceController } from './trace.controller.js';

@Module({
  controllers: [TraceController],
})
export class TraceModule {}
