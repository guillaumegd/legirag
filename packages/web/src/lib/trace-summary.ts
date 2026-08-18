import type { ExecutionTrace } from '@legirag/shared/schema';

export interface TraceSummary {
  modelCalls: number;
  toolCalls: number;
  totalTokens: number;
}

// Agrège les totaux affichés en tête de la page de trace directement à
// partir des appels individuels de chaque étape (ExecutionTraceStep.calls) -
// jamais à partir de ExecutionTrace.tokenUsage, qui ne porte que l'usage
// cumulé du draft final et exclut délibérément le routeur (note item 9b) :
// la barre de totaux doit rester cohérente avec ce que la timeline affiche
// vraiment, pas un chiffre calculé différemment.
export function summarizeTrace(trace: ExecutionTrace): TraceSummary {
  let modelCalls = 0;
  let toolCalls = 0;
  let totalTokens = 0;

  for (const step of trace.steps) {
    for (const call of step.calls ?? []) {
      if (call.kind === 'model') {
        modelCalls += 1;
      } else {
        toolCalls += 1;
      }
      if (call.tokenUsage) {
        totalTokens += call.tokenUsage.promptTokens + call.tokenUsage.completionTokens;
      }
    }
  }

  return { modelCalls, toolCalls, totalTokens };
}
