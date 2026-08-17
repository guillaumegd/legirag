import type { AgentState } from '@legirag/agent';
import { ReponseStructuree as ReponseStructureeSchema } from '@legirag/shared';
import { formatSseEvent } from './sse.js';

export interface SseSink {
  write(chunk: string): void;
  end(): void;
}

export interface GraphInput {
  question: string;
  dateReference: Date;
  codes: string[] | undefined;
  traceId: string;
  reponse: undefined;
}

export interface StreamableGraph {
  stream(
    input: GraphInput,
    options: { streamMode: ['updates', 'values'] },
  ): Promise<AsyncIterable<['updates' | 'values', unknown]>>;
}

// Chaque nœud du graphe (route/search/draft/followRenvois) intercepte déjà
// ses propres pannes et dégrade vers une abstention plutôt que de laisser
// l'exception remonter (9c) - ce catch ne couvre donc que ce que le graphe
// lui-même ne peut pas récupérer (construction du graphe, bug, échec de la
// validation Zod finale), pour ne jamais laisser le flux SSE se terminer
// par un crash ou un blocage (audit F-01/F-02 : la construction doit rester
// dans la frontière protégée, et end() doit s'exécuter même si l'écriture
// de l'événement error échoue à son tour, ex. client déjà déconnecté).
export async function streamQuestionToSink(
  buildGraph: () => StreamableGraph,
  input: GraphInput,
  sink: SseSink,
): Promise<void> {
  try {
    const graph = buildGraph();
    const stream = await graph.stream(input, { streamMode: ['updates', 'values'] });
    let derniereValeur: AgentState | undefined;

    for await (const [mode, payload] of stream) {
      if (mode === 'updates') {
        for (const [node, partialState] of Object.entries(payload as Record<string, unknown>)) {
          sink.write(formatSseEvent(node, partialState));
        }
      } else {
        derniereValeur = payload as AgentState;
      }
    }

    const reponse = ReponseStructureeSchema.parse(derniereValeur?.reponse);
    sink.write(formatSseEvent('done', reponse));
  } catch (error) {
    console.error('POST /question : échec non récupéré par le graphe.', error);
    try {
      sink.write(formatSseEvent('error', { message: 'Une erreur interne est survenue pendant le traitement de la question.' }));
    } catch (writeError) {
      console.error("POST /question : impossible d'écrire l'événement error (sink probablement déjà fermé).", writeError);
    }
  } finally {
    sink.end();
  }
}
