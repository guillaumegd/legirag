import type { AgentCall, TokenUsage } from '@legirag/agent';
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

// Item 12a : chaque événement porte state.calls dans son intégralité
// jusque-là (même accumulation manuelle que citations/tokenUsage sur
// AgentState - voir la note dans packages/agent/src/state.ts), pas
// seulement les appels ajoutés par ce nœud. On retrouve la part propre à
// chaque pas en suivant un compteur courant, même principe que
// previousTimestampMs ci-dessous pour durationMs. Un nœud dont la branche
// exécutée n'a touché aucun appel (ex. search/followRenvois sur leur chemin
// d'échec) omet complètement `calls` - traité comme "rien ajouté ici",
// jamais comme une régression du compteur.
function callsAddedByStep(partialState: Record<string, unknown>, previousCallsCount: number): AgentCall[] {
  const calls = partialState.calls;
  if (!Array.isArray(calls)) return [];
  return (calls as AgentCall[]).slice(previousCallsCount);
}

// durationMs par étape est une approximation par delta d'horloge murale
// entre deux événements 'updates' consécutifs du stream LangGraph.js (pas
// une instrumentation interne au nœud) - suffisant pour le besoin "minimal"
// de 11b, documenté ici pour que ça ne soit jamais lu comme une mesure plus
// précise qu'elle ne l'est.
export function buildExecutionTrace(input: BuildExecutionTraceInput): ExecutionTrace {
  const steps: ExecutionTrace['steps'] = [];
  let previousTimestampMs = input.startedAtMs;
  let previousCallsCount = 0;
  for (const event of input.events) {
    const calls = callsAddedByStep(event.partialState, previousCallsCount);
    steps.push({
      node: event.node,
      durationMs: event.timestampMs - previousTimestampMs,
      summary: summarizeNode(event.node, event.partialState),
      ...(calls.length > 0 ? { calls } : {}),
    });
    previousTimestampMs = event.timestampMs;
    previousCallsCount += calls.length;
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
