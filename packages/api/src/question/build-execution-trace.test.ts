import { describe, expect, it } from 'vitest';
import { buildExecutionTrace, type TraceEvent } from './build-execution-trace.js';

function baseInput(overrides: Partial<Parameters<typeof buildExecutionTrace>[0]> = {}) {
  return {
    traceId: 'trace-001',
    question: 'vitesse maximale en agglomération',
    dateReference: '2026-08-17',
    startedAtMs: 1_000,
    endedAtMs: 1_000,
    events: [] as TraceEvent[],
    finalCodes: undefined,
    finalTokenUsage: undefined,
    createdAt: '2026-08-17T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildExecutionTrace', () => {
  it('produit un pas par nœud avec des durées calculées par delta entre événements', () => {
    const events: TraceEvent[] = [
      { node: 'route', timestampMs: 1_100, partialState: { codes: ['code-de-la-route'] } },
      { node: 'search', timestampMs: 1_300, partialState: { citations: [{ article_identifier: 'A' }, { article_identifier: 'B' }] } },
      { node: 'draft', timestampMs: 1_500, partialState: { reponse: { confiance: 'elevee' }, draftAttempts: 1 } },
    ];
    const trace = buildExecutionTrace(baseInput({ events, endedAtMs: 1_500 }));

    expect(trace.steps.map((s) => s.durationMs)).toEqual([100, 200, 200]);
    expect(trace.steps.map((s) => s.node)).toEqual(['route', 'search', 'draft']);
    expect(trace.totalDurationMs).toBe(500);
  });

  it('résume chaque nœud avec ses champs propres (route/search/draft/followRenvois)', () => {
    const events: TraceEvent[] = [
      { node: 'route', timestampMs: 1_100, partialState: { codes: ['code-de-la-route'] } },
      { node: 'search', timestampMs: 1_200, partialState: { citations: [{}, {}, {}] } },
      { node: 'draft', timestampMs: 1_300, partialState: { reponse: { confiance: 'moyenne' }, draftAttempts: 2 } },
      { node: 'followRenvois', timestampMs: 1_400, partialState: { newCitationsFound: 1 } },
    ];
    const trace = buildExecutionTrace(baseInput({ events, endedAtMs: 1_400 }));

    expect(trace.steps[0]?.summary).toEqual({ codes: ['code-de-la-route'] });
    expect(trace.steps[1]?.summary).toEqual({ citationsCount: 3 });
    expect(trace.steps[2]?.summary).toEqual({ confiance: 'moyenne', draftAttempts: 2 });
    expect(trace.steps[3]?.summary).toEqual({ newCitationsFound: 1 });
  });

  it("gère un run sans followRenvois (aucune itération de renvoi trouvée)", () => {
    const events: TraceEvent[] = [
      { node: 'route', timestampMs: 1_100, partialState: { codes: ['code-du-travail'] } },
      { node: 'search', timestampMs: 1_200, partialState: { citations: [{}] } },
      { node: 'draft', timestampMs: 1_300, partialState: { reponse: { confiance: 'elevee' }, draftAttempts: 1 } },
    ];
    const trace = buildExecutionTrace(baseInput({ events, endedAtMs: 1_300 }));

    expect(trace.steps).toHaveLength(3);
    expect(trace.steps.some((s) => s.node === 'followRenvois')).toBe(false);
  });

  it('gère une séquence vide (échec avant le premier nœud)', () => {
    const trace = buildExecutionTrace(baseInput({ events: [], endedAtMs: 1_050 }));

    expect(trace.steps).toEqual([]);
    expect(trace.totalDurationMs).toBe(50);
  });

  it('omet codes et tokenUsage quand ils sont absents plutôt que de les mettre à undefined', () => {
    const trace = buildExecutionTrace(baseInput({ finalCodes: undefined, finalTokenUsage: undefined }));

    expect('codes' in trace).toBe(false);
    expect('tokenUsage' in trace).toBe(false);
  });

  it('inclut codes et tokenUsage quand ils sont fournis', () => {
    const trace = buildExecutionTrace(
      baseInput({
        finalCodes: ['code-de-la-route'],
        finalTokenUsage: { promptTokens: 1200, completionTokens: 150 },
      }),
    );

    expect(trace.codes).toEqual(['code-de-la-route']);
    expect(trace.tokenUsage).toEqual({ promptTokens: 1200, completionTokens: 150 });
  });

  it("attribue un résumé vide à un nœud inconnu plutôt que de planter", () => {
    const events: TraceEvent[] = [{ node: 'nouveauNoeud', timestampMs: 1_100, partialState: { toutCeQuOnVeut: true } }];
    const trace = buildExecutionTrace(baseInput({ events, endedAtMs: 1_100 }));

    expect(trace.steps[0]?.summary).toEqual({});
  });

  it('attribue à chaque pas seulement les appels qu’il a ajoutés (12a)', () => {
    const routeCall = { kind: 'model' as const, name: 'routeQuestion', durationMs: 40, tokenUsage: { promptTokens: 20, completionTokens: 5 } };
    const searchCall = { kind: 'tool' as const, name: 'retriever.search', durationMs: 60 };
    const draftCall1 = { kind: 'model' as const, name: 'generateObject#1', durationMs: 300, tokenUsage: { promptTokens: 500, completionTokens: 40 } };
    const draftCall2 = { kind: 'model' as const, name: 'generateObject#2', durationMs: 250, tokenUsage: { promptTokens: 500, completionTokens: 60 } };

    const events: TraceEvent[] = [
      { node: 'route', timestampMs: 1_100, partialState: { codes: ['code-de-la-route'], calls: [routeCall] } },
      { node: 'search', timestampMs: 1_200, partialState: { citations: [{}], calls: [routeCall, searchCall] } },
      {
        node: 'draft',
        timestampMs: 1_500,
        partialState: { reponse: { confiance: 'elevee' }, draftAttempts: 2, calls: [routeCall, searchCall, draftCall1, draftCall2] },
      },
    ];
    const trace = buildExecutionTrace(baseInput({ events, endedAtMs: 1_500 }));

    expect(trace.steps[0]?.calls).toEqual([routeCall]);
    expect(trace.steps[1]?.calls).toEqual([searchCall]);
    expect(trace.steps[2]?.calls).toEqual([draftCall1, draftCall2]);
  });

  it('omet calls plutôt que [] quand un nœud n’a touché aucun appel (branche d’échec)', () => {
    const events: TraceEvent[] = [{ node: 'search', timestampMs: 1_100, partialState: { citations: [] } }];
    const trace = buildExecutionTrace(baseInput({ events, endedAtMs: 1_100 }));

    expect('calls' in (trace.steps[0] ?? {})).toBe(false);
  });
});
