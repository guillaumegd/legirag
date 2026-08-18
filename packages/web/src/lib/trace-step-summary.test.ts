import { describe, expect, it } from 'vitest';
import type { ExecutionTraceStep } from '@legirag/shared/schema';
import { describeStepNode, describeStepSummary } from './trace-step-summary.js';

function step(partial: Partial<ExecutionTraceStep> & Pick<ExecutionTraceStep, 'node' | 'summary'>): ExecutionTraceStep {
  return { durationMs: 0, ...partial };
}

describe('describeStepSummary', () => {
  it('lists the humanized code names for route', () => {
    expect(describeStepSummary(step({ node: 'route', summary: { codes: ['code-de-la-route'] } }))).toBe(
      'Routé vers Code de la route',
    );
  });

  it('reports no filtering when route found no code', () => {
    expect(describeStepSummary(step({ node: 'route', summary: { codes: null } }))).toBe(
      'Recherche non filtrée par code',
    );
  });

  it('pluralizes the citation count for search', () => {
    expect(describeStepSummary(step({ node: 'search', summary: { citationsCount: 1 } }))).toBe(
      '1 citation trouvée',
    );
    expect(describeStepSummary(step({ node: 'search', summary: { citationsCount: 3 } }))).toBe(
      '3 citations trouvées',
    );
    expect(describeStepSummary(step({ node: 'search', summary: { citationsCount: 0 } }))).toBe(
      'Aucune citation trouvée',
    );
  });

  it('shows the confidence label and attempt number for draft', () => {
    expect(
      describeStepSummary(step({ node: 'draft', summary: { confiance: 'elevee', draftAttempts: 2 } })),
    ).toBe('Confiance élevée (tentative 2)');
  });

  it('falls back to a generic label when draft has no confiance yet', () => {
    expect(describeStepSummary(step({ node: 'draft', summary: {} }))).toBe('Brouillon produit');
  });

  it('pluralizes new citations found for followRenvois', () => {
    expect(describeStepSummary(step({ node: 'followRenvois', summary: { newCitationsFound: 1 } }))).toBe(
      '1 nouveau renvoi suivi',
    );
    expect(describeStepSummary(step({ node: 'followRenvois', summary: { newCitationsFound: 0 } }))).toBe(
      'Aucun renvoi supplémentaire à suivre',
    );
  });

  it('falls back to the raw node name for an unknown node', () => {
    expect(describeStepSummary(step({ node: 'verify', summary: {} }))).toBe('verify');
  });
});

describe('describeStepNode', () => {
  it('maps each fixed-chain node to its French label', () => {
    expect(describeStepNode('route')).toBe('Routage');
    expect(describeStepNode('search')).toBe('Recherche');
    expect(describeStepNode('draft')).toBe('Rédaction');
    expect(describeStepNode('followRenvois')).toBe('Suivi des renvois');
  });

  it('falls back to the raw name for an unknown node', () => {
    expect(describeStepNode('verify')).toBe('verify');
  });
});
