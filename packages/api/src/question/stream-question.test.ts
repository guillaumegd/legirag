import { buildFixedChainGraph } from '@legirag/agent';
import type { Retriever } from '@legirag/shared';
import { describe, expect, it } from 'vitest';
import { streamQuestionToSink, type GraphInput, type StreamableGraph } from './stream-question.js';

const modelNonAppele = {} as Parameters<typeof buildFixedChainGraph>[1];
const routeurFactice = async (): Promise<{ codes: string[]; confiance: number; raisonnement: string }> => ({
  codes: [],
  confiance: 1,
  raisonnement: 'test',
});

function buildInput(overrides: Partial<GraphInput> = {}): GraphInput {
  return {
    question: 'question quelconque',
    dateReference: new Date('2026-08-17'),
    codes: undefined,
    traceId: 'trace-test',
    reponse: undefined,
    ...overrides,
  };
}

class RecordingSink {
  events: string[] = [];
  ended = false;
  private readonly throwOnWrite: boolean;

  constructor(options: { throwOnWrite?: boolean } = {}) {
    this.throwOnWrite = options.throwOnWrite ?? false;
  }

  write(chunk: string): void {
    if (this.throwOnWrite) {
      throw new Error('EPIPE : écriture après déconnexion du client');
    }
    this.events.push(chunk);
  }

  end(): void {
    this.ended = true;
  }
}

describe('streamQuestionToSink', () => {
  it('un échec de retriever.search dégrade en abstention (9c) au lieu de faire planter le flux', async () => {
    const retrieverCasse: Retriever = {
      async search() {
        throw new Error('connexion recherche indisponible');
      },
    };
    const graph = buildFixedChainGraph(retrieverCasse, modelNonAppele, routeurFactice);
    const sink = new RecordingSink();

    await streamQuestionToSink(() => graph, buildInput(), sink);

    expect(sink.ended).toBe(true);
    const doneEvent = sink.events.find((e) => e.startsWith('event: done'));
    expect(doneEvent).toBeDefined();
    expect(doneEvent).toContain('"confiance":"abstention"');
    expect(sink.events.some((e) => e.startsWith('event: error'))).toBe(false);
  });

  it("un échec inattendu de graph.stream() se termine par un événement error, jamais une exception non gérée", async () => {
    const grapheCasse: StreamableGraph = {
      async stream() {
        throw new Error('panne inattendue du graphe');
      },
    };
    const sink = new RecordingSink();

    await expect(streamQuestionToSink(() => grapheCasse, buildInput(), sink)).resolves.toBeUndefined();

    expect(sink.ended).toBe(true);
    const errorEvent = sink.events.find((e) => e.startsWith('event: error'));
    expect(errorEvent).toBeDefined();
    expect(sink.events.some((e) => e.startsWith('event: done'))).toBe(false);
  });

  it('termine toujours le sink (end) même quand le flux ne produit aucune valeur exploitable', async () => {
    const grapheVide: StreamableGraph = {
      async stream() {
        return (async function* () {
          // ne produit rien - derniereValeur reste undefined, ReponseStructuree.parse doit échouer
        })();
      },
    };
    const sink = new RecordingSink();

    await streamQuestionToSink(() => grapheVide, buildInput(), sink);

    expect(sink.ended).toBe(true);
    expect(sink.events.some((e) => e.startsWith('event: error'))).toBe(true);
  });

  it('F-01 : une construction de graphe qui échoue (ex. variable d\'environnement manquante) produit un événement error plutôt qu\'un rejet non géré', async () => {
    const construireGrapheCasse = (): StreamableGraph => {
      throw new Error("Variable d'environnement manquante : MODEL_VOLUME");
    };
    const sink = new RecordingSink();

    await expect(streamQuestionToSink(construireGrapheCasse, buildInput(), sink)).resolves.toBeUndefined();

    expect(sink.ended).toBe(true);
    expect(sink.events.some((e) => e.startsWith('event: error'))).toBe(true);
  });

  it('F-02 : end() est toujours appelé même si écrire le message error échoue à son tour (client déjà déconnecté)', async () => {
    const grapheCasse: StreamableGraph = {
      async stream() {
        throw new Error('panne inattendue du graphe');
      },
    };
    const sink = new RecordingSink({ throwOnWrite: true });

    await expect(streamQuestionToSink(() => grapheCasse, buildInput(), sink)).resolves.toBeUndefined();

    expect(sink.ended).toBe(true);
  });
});
