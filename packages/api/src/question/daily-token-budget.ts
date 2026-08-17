export interface DailyTokenBudgetOptions {
  maxDailyTokens: number;
  // Injectable pour les tests (pas de vrai temps qui passe) - même
  // raisonnement que persistTraceFn/buildGraph ailleurs dans ce paquet.
  today: () => string;
}

// Logique pure du disjoncteur quotidien (11c) - aucune dépendance NestJS ici,
// testée directement avec une horloge fictive plutôt qu'en attendant un vrai
// changement de jour ou en démarrant un serveur.
export class DailyTokenBudget {
  private tokensUsedToday = 0;
  private dayKey: string;
  private readonly maxDailyTokens: number;
  private readonly today: () => string;

  constructor(options: DailyTokenBudgetOptions) {
    this.maxDailyTokens = options.maxDailyTokens;
    this.today = options.today;
    this.dayKey = options.today();
  }

  private resetIfNewDay(): void {
    const currentDayKey = this.today();
    if (currentDayKey !== this.dayKey) {
      this.dayKey = currentDayKey;
      this.tokensUsedToday = 0;
    }
  }

  isOverBudget(): boolean {
    this.resetIfNewDay();
    return this.tokensUsedToday >= this.maxDailyTokens;
  }

  recordUsage(tokens: number): void {
    this.resetIfNewDay();
    this.tokensUsedToday += tokens;
  }
}
