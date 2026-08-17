import type { TokenUsage } from '@legirag/agent';
import { ExecutionTrace } from '@legirag/shared';

export interface TraceEvent {
  node: string;
  timestampMs: number;
  partialState: Record<string, unknown>;
}

export interface BuildExecutionTraceInput {
  traceId: string;
  question: string;
  dateReference: string;
  startedAtMs: number;
  endedAtMs: number;
  events: TraceEvent[];
  finalCodes: string[] | undefined;
  finalTokenUsage: TokenUsage | undefined;
  createdAt: string;
}

// Un "tool call" ici = une exécution de nœud de la chaîne fixe (route/
// search/draft/followRenvois) - pas d'appel outil dynamique à instrumenter
// séparément (note item 9). Ne connaît que les champs qui existent
// réellement dans le partialState que chaque nœud renvoie (packages/agent/
// src/graph.ts) - un nœud inconnu (futur ajout au graphe) reçoit un résumé
// vide plutôt qu'un plantage.
function summarizeNode(node: string, partialState: Record<string, unknown>): Record<string, unknown> {
  switch (node) {
    case 'route':
      return { codes: partialState.codes ?? null };
    case 'search':
      return { citationsCount: Array.isArray(partialState.citations) ? partialState.citations.length : undefined };
    case 'draft': {
      const reponse = partialState.reponse as { confiance?: string } | undefined;
      return { confiance: reponse?.confiance, draftAttempts: partialState.draftAttempts };
    }
    case 'followRenvois':
      return { newCitationsFound: partialState.newCitationsFound };
    default:
      return {};
  }
}

// durationMs par étape est une approximation par delta d'horloge murale
// entre deux événements 'updates' consécutifs du stream LangGraph.js (pas
// une instrumentation interne au nœud) - suffisant pour le besoin "minimal"
// de 11b, documenté ici pour que ça ne soit jamais lu comme une mesure plus
// précise qu'elle ne l'est.
export function buildExecutionTrace(input: BuildExecutionTraceInput): ExecutionTrace {
  const steps: ExecutionTrace['steps'] = [];
  let previousTimestampMs = input.startedAtMs;
  for (const event of input.events) {
    steps.push({
      node: event.node,
      durationMs: event.timestampMs - previousTimestampMs,
      summary: summarizeNode(event.node, event.partialState),
    });
    previousTimestampMs = event.timestampMs;
  }

  return ExecutionTrace.parse({
    traceId: input.traceId,
    question: input.question,
    dateReference: input.dateReference,
    ...(input.finalCodes !== undefined ? { codes: input.finalCodes } : {}),
    steps,
    ...(input.finalTokenUsage !== undefined ? { tokenUsage: input.finalTokenUsage } : {}),
    totalDurationMs: input.endedAtMs - input.startedAtMs,
    createdAt: input.createdAt,
  });
}
