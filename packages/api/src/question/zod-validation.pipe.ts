import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const [firstIssue] = result.error.issues;
      const field = firstIssue?.path.join('.') ?? 'body';
      throw new BadRequestException(`${field} : ${firstIssue?.message ?? 'validation invalide'}`);
    }
    return result.data;
  }
}
