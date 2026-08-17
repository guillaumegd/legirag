import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CostGuardService } from './cost-guard.service.js';
import { DailyCostCapGuard } from './daily-cost-cap.guard.js';

function fakeCostGuard(overBudget: boolean): CostGuardService {
  return { isOverBudget: () => overBudget, recordUsage: () => {} } as unknown as CostGuardService;
}

describe('DailyCostCapGuard', () => {
  it('autorise la requête quand le budget quotidien n’est pas dépassé', () => {
    const guard = new DailyCostCapGuard(fakeCostGuard(false));
    expect(guard.canActivate()).toBe(true);
  });

  it('rejette la requête avec 429 quand le budget quotidien est dépassé', () => {
    const guard = new DailyCostCapGuard(fakeCostGuard(true));
    expect(() => guard.canActivate()).toThrow(HttpException);
    try {
      guard.canActivate();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });
});
