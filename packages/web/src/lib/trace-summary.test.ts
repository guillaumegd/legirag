import { describe, expect, it } from 'vitest';
import type { ExecutionTrace } from '@legirag/shared/schema';
import { summarizeTrace } from './trace-summary.js';

const baseTrace: Omit<ExecutionTrace, 'steps'> = {
  traceId: 'trc_test',
  question: 'Question de test',
  dateReference: '2026-08-18',
  totalDurationMs: 1000,
  createdAt: '2026-08-18T10:00:00.000Z',
};

describe('summarizeTrace', () => {
  it('returns zero counts for a trace whose steps carry no calls', () => {
    const trace: ExecutionTrace = {
      ...baseTrace,
      steps: [
        { node: 'route', durationMs: 100, summary: { codes: ['code-de-la-route'] } },
        { node: 'search', durationMs: 200, summary: { citationsCount: 3 } },
      ],
    };

    expect(summarizeTrace(trace)).toEqual({ modelCalls: 0, toolCalls: 0, totalTokens: 0 });
  });

  it('counts model and tool calls separately across steps', () => {
    const trace: ExecutionTrace = {
      ...baseTrace,
      steps: [
        {
          node: 'route',
          durationMs: 100,
          summary: {},
          calls: [{ kind: 'model', name: 'routeQuestion', durationMs: 100 }],
        },
        {
          node: 'search',
          durationMs: 200,
          summary: {},
          calls: [{ kind: 'tool', name: 'search', durationMs: 150 }],
        },
      ],
    };

    expect(summarizeTrace(trace)).toEqual({ modelCalls: 1, toolCalls: 1, totalTokens: 0 });
  });

  it('sums token usage across multiple draft attempts, ignoring calls without token usage', () => {
    const trace: ExecutionTrace = {
      ...baseTrace,
      steps: [
        {
          node: 'draft',
          durationMs: 500,
          summary: { confiance: 'moyenne', draftAttempts: 2 },
          calls: [
            { kind: 'model', name: 'draft', durationMs: 300, tokenUsage: { promptTokens: 500, completionTokens: 120 } },
            { kind: 'model', name: 'draft', durationMs: 280, tokenUsage: { promptTokens: 520, completionTokens: 140 } },
          ],
        },
        {
          node: 'followRenvois',
          durationMs: 90,
          summary: { newCitationsFound: 1 },
          calls: [{ kind: 'tool', name: 'followRenvois', durationMs: 90 }],
        },
      ],
    };

    expect(summarizeTrace(trace)).toEqual({ modelCalls: 2, toolCalls: 1, totalTokens: 1280 });
  });
});
