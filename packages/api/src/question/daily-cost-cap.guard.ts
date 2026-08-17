import { HttpException, HttpStatus, Inject, Injectable, type CanActivate } from '@nestjs/common';
import { CostGuardService } from './cost-guard.service.js';

@Injectable()
export class DailyCostCapGuard implements CanActivate {
  constructor(@Inject(CostGuardService) private readonly costGuard: CostGuardService) {}

  canActivate(): boolean {
    if (this.costGuard.isOverBudget()) {
      throw new HttpException('Le budget quotidien de tokens est épuisé - réessayez demain.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
