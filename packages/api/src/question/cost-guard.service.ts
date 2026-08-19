import { Injectable } from '@nestjs/common';
import type { TokenUsage } from '@legirag/agent';
import { readPositiveNumberEnv } from '@legirag/shared';
import { DailyTokenBudget } from './daily-token-budget.js';

// Pas de requireEnv ici : contrairement aux ids de modèle/identifiants
// (config requise, doit échouer vite si absente), un seuil de coût a une
// valeur de repli sûre - même précédent que PORT dans main.ts.
const DEFAULT_MAX_DAILY_TOKENS = 2_000_000;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Enveloppe NestJS fine autour de DailyTokenBudget (logique réelle, testée
// séparément sans dépendance au framework) - pur câblage, pas de test dédié,
// même traitement que ThrottlerModule dans app.module.ts.
@Injectable()
export class CostGuardService {
  private readonly budget = new DailyTokenBudget({
    maxDailyTokens: readPositiveNumberEnv('MAX_DAILY_TOKENS', DEFAULT_MAX_DAILY_TOKENS),
    today: todayUtc,
  });

  isOverBudget(): boolean {
    return this.budget.isOverBudget();
  }

  recordUsage(tokenUsage: TokenUsage | undefined): void {
    if (tokenUsage === undefined) return;
    this.budget.recordUsage(tokenUsage.promptTokens + tokenUsage.completionTokens);
  }
}
