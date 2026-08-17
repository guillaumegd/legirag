export interface CostRow {
  questionId: string;
  category: string;
  llmCalls: number;
  promptTokens: number;
  completionTokens: number;
  renvoiIterations: number;
}

export interface CategoryCostMetrics {
  category: string;
  questionCount: number;
  llmCalls: number;
  promptTokens: number;
  completionTokens: number;
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function aggregateCost(rows: CostRow[]): CategoryCostMetrics[] {
  const categories = [...new Set(rows.map((r) => r.category))];
  return categories.map((category) => {
    const inCategory = rows.filter((r) => r.category === category);
    return {
      category,
      questionCount: inCategory.length,
      llmCalls: mean(inCategory.map((r) => r.llmCalls)),
      promptTokens: mean(inCategory.map((r) => r.promptTokens)),
      completionTokens: mean(inCategory.map((r) => r.completionTokens)),
    };
  });
}
