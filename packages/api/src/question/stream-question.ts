import type { AgentState, TokenUsage } from '@legirag/agent';
import { persistTrace } from '@legirag/retrieval';
import { ReponseStructuree as ReponseStructureeSchema, type ExecutionTrace } from '@legirag/shared';
import { buildExecutionTrace, type TraceEvent } from './build-execution-trace.js';
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
  // Injecté comme buildGraph/routeQuestion/suivreRenvoiFn ailleurs dans ce
  // projet : la valeur par défaut parle à une vraie base, donc les tests
  // unitaires doivent la remplacer plutôt que de déclencher une connexion
  // réseau réelle à chaque run testé.
  persistTraceFn: (trace: ExecutionTrace) => Promise<void> = persistTrace,
  // Synchrone et non-lançant par contrat (11c) : ne fait qu'incrémenter un
  // compteur en mémoire (CostGuardService) - contrairement à persistTraceFn,
  // pas d'I/O réelle, donc pas besoin de son propre try/catch. Défaut no-op
  // pour que les tests existants n'aient rien à changer.
  recordUsageFn: (tokenUsage: TokenUsage | undefined) => void = () => {},
): Promise<void> {
  const startedAtMs = Date.now();
  const traceEvents: TraceEvent[] = [];
  try {
    const graph = buildGraph();
    const stream = await graph.stream(input, { streamMode: ['updates', 'values'] });
    let derniereValeur: AgentState | undefined;

    for await (const [mode, payload] of stream) {
      if (mode === 'updates') {
        for (const [node, partialState] of Object.entries(payload as Record<string, unknown>)) {
          traceEvents.push({ node, timestampMs: Date.now(), partialState: partialState as Record<string, unknown> });
          sink.write(formatSseEvent(node, partialState));
        }
      } else {
        derniereValeur = payload as AgentState;
      }
    }

    const reponse = ReponseStructureeSchema.parse(derniereValeur?.reponse);
    recordUsageFn(derniereValeur?.tokenUsage);

    // Persistance best-effort (11b) : un échec ici ne doit jamais priver le
    // client de sa réponse déjà valide, seulement rendre son trace_id
    // introuvable via GET /trace/:trace_id.
    try {
      const trace = buildExecutionTrace({
        traceId: input.traceId,
        question: input.question,
        dateReference: reponse.date_reference,
        startedAtMs,
        endedAtMs: Date.now(),
        events: traceEvents,
        finalCodes: derniereValeur?.codes,
        finalTokenUsage: derniereValeur?.tokenUsage,
        createdAt: new Date().toISOString(),
      });
      await persistTraceFn(trace);
    } catch (traceError) {
      console.error('POST /question : échec de la persistance de la trace, réponse envoyée sans trace consultable.', traceError);
    }

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
