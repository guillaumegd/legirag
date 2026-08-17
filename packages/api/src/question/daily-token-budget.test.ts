import { describe, expect, it } from 'vitest';
import { DailyTokenBudget } from './daily-token-budget.js';

function fakeClock(days: string[]): () => string {
  let index = 0;
  return () => {
    const day = days[index];
    if (index < days.length - 1) index++;
    return day ?? days[days.length - 1] ?? '2026-08-17';
  };
}

describe('DailyTokenBudget', () => {
  it("n'est pas dépassé tant que l'usage cumulé reste sous la limite", () => {
    const budget = new DailyTokenBudget({ maxDailyTokens: 1000, today: fakeClock(['2026-08-17']) });
    budget.recordUsage(500);
    expect(budget.isOverBudget()).toBe(false);
  });

  it('est dépassé une fois la limite atteinte ou franchie', () => {
    const budget = new DailyTokenBudget({ maxDailyTokens: 1000, today: fakeClock(['2026-08-17']) });
    budget.recordUsage(600);
    budget.recordUsage(400);
    expect(budget.isOverBudget()).toBe(true);
  });

  it('se réinitialise quand le jour change', () => {
    // 4 appels à today() : constructeur, recordUsage, puis chaque isOverBudget.
    const clock = fakeClock(['2026-08-17', '2026-08-17', '2026-08-17', '2026-08-18']);
    const budget = new DailyTokenBudget({ maxDailyTokens: 1000, today: clock });
    budget.recordUsage(1000);
    expect(budget.isOverBudget()).toBe(true);
    expect(budget.isOverBudget()).toBe(false);
  });

  it('reste sous la limite avec un budget non consommé', () => {
    const budget = new DailyTokenBudget({ maxDailyTokens: 1000, today: fakeClock(['2026-08-17']) });
    expect(budget.isOverBudget()).toBe(false);
  });
});
