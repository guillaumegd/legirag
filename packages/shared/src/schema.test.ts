import { describe, expect, it } from 'vitest';
import { Citation, ExecutionTrace, ReponseStructuree } from './schema.js';

const citationValide = {
  article_identifier: 'LEGIARTI000006841540',
  subdivision: 'I',
  code: 'Code de la route',
  texte_exact: 'Hors agglomération, la vitesse des véhicules est limitée à…',
  date_debut: '2018-07-01',
  etat: 'VIGUEUR' as const,
  url_legifrance: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006841540',
};

const reponseValide = {
  verdict: 'La vitesse est limitée à 110 km/h sur autoroute par temps de pluie.',
  regle_principale: citationValide,
  textes_complementaires: [],
  hors_perimetre: ['Arrêtés préfectoraux de limitation locale'],
  confiance: 'elevee' as const,
  date_reference: '2026-08-11',
  trace_id: 'trace-001',
};

describe('Citation', () => {
  // R1 : garantie par le type, avant même le vérificateur
  it('rejette une citation sans article_identifier', () => {
    const { article_identifier: _omis, ...sansIdentifiant } = citationValide;
    expect(Citation.safeParse(sansIdentifiant).success).toBe(false);
  });

  it('accepte une citation complète', () => {
    expect(Citation.safeParse(citationValide).success).toBe(true);
  });
});

describe('ReponseStructuree', () => {
  it('rejette une réponse dont regle_principale est sans article_identifier', () => {
    const { article_identifier: _omis, ...citationInvalide } = citationValide;
    const invalide = { ...reponseValide, regle_principale: citationInvalide };
    expect(ReponseStructuree.safeParse(invalide).success).toBe(false);
  });

  // R4 : jamais vide
  it('rejette hors_perimetre vide', () => {
    const invalide = { ...reponseValide, hors_perimetre: [] };
    expect(ReponseStructuree.safeParse(invalide).success).toBe(false);
  });

  // R5 + F11
  it('rejette une abstention sans escalade', () => {
    const invalide = { ...reponseValide, confiance: 'abstention' as const, escalade: undefined };
    expect(ReponseStructuree.safeParse(invalide).success).toBe(false);
  });

  it('accepte une abstention avec escalade', () => {
    const valide = {
      ...reponseValide,
      confiance: 'abstention' as const,
      escalade: { motif: 'Source hors périmètre', interlocuteur: 'Un avocat en droit du travail' },
    };
    expect(ReponseStructuree.safeParse(valide).success).toBe(true);
  });

  // Item 8a : une recherche vide n'a aucune citation réelle à donner
  it('accepte une abstention sans regle_principale', () => {
    const { regle_principale: _omis, ...sansRegle } = reponseValide;
    const valide = {
      ...sansRegle,
      confiance: 'abstention' as const,
      escalade: { motif: 'Aucun résultat de recherche', interlocuteur: 'support juridique legirag' },
    };
    expect(ReponseStructuree.safeParse(valide).success).toBe(true);
  });

  it('rejette une réponse non abstentionniste sans regle_principale', () => {
    const { regle_principale: _omis, ...sansRegle } = reponseValide;
    expect(ReponseStructuree.safeParse(sansRegle).success).toBe(false);
  });

  it('accepte une réponse complète et valide', () => {
    expect(ReponseStructuree.safeParse(reponseValide).success).toBe(true);
  });
});

describe('ExecutionTrace', () => {
  const traceValide = {
    traceId: 'trace-001',
    question: 'vitesse maximale en agglomération',
    dateReference: '2026-08-17',
    codes: ['code-de-la-route'],
    steps: [
      { node: 'route', durationMs: 120, summary: { codes: ['code-de-la-route'] } },
      { node: 'search', durationMs: 340, summary: { citationsCount: 3 } },
      { node: 'draft', durationMs: 890, summary: { confiance: 'elevee', draftAttempts: 1 } },
    ],
    tokenUsage: { promptTokens: 1200, completionTokens: 150 },
    totalDurationMs: 1350,
    createdAt: '2026-08-17T10:00:00.000Z',
  };

  it('accepte une trace complète et valide', () => {
    expect(ExecutionTrace.safeParse(traceValide).success).toBe(true);
  });

  it('accepte une trace sans codes (routage dégradé) ni tokenUsage', () => {
    const { codes: _omisCodes, tokenUsage: _omisUsage, ...sansCodesNiUsage } = traceValide;
    expect(ExecutionTrace.safeParse(sansCodesNiUsage).success).toBe(true);
  });

  it('accepte des steps vides (aucun nœud exécuté avant échec)', () => {
    const valide = { ...traceValide, steps: [] };
    expect(ExecutionTrace.safeParse(valide).success).toBe(true);
  });

  it('rejette un step avec une durée négative', () => {
    const invalide = { ...traceValide, steps: [{ node: 'route', durationMs: -1, summary: {} }] };
    expect(ExecutionTrace.safeParse(invalide).success).toBe(false);
  });

  it('rejette une trace sans traceId', () => {
    const { traceId: _omis, ...sansTraceId } = traceValide;
    expect(ExecutionTrace.safeParse(sansTraceId).success).toBe(false);
  });

  it('accepte un step avec le détail des appels individuels (12a)', () => {
    const avecCalls = {
      ...traceValide,
      steps: [
        {
          node: 'draft',
          durationMs: 890,
          summary: { confiance: 'elevee', draftAttempts: 2 },
          calls: [
            { kind: 'model', name: 'generateObject#1', durationMs: 400, tokenUsage: { promptTokens: 600, completionTokens: 40 } },
            { kind: 'model', name: 'generateObject#2', durationMs: 490, tokenUsage: { promptTokens: 600, completionTokens: 110 } },
          ],
        },
      ],
    };
    expect(ExecutionTrace.safeParse(avecCalls).success).toBe(true);
  });

  it('accepte un step sans calls (traces persistées avant 12a)', () => {
    const sansCalls = { ...traceValide, steps: [{ node: 'route', durationMs: 120, summary: {} }] };
    expect(ExecutionTrace.safeParse(sansCalls).success).toBe(true);
  });

  it('rejette un appel outil avec un kind inconnu', () => {
    const invalide = {
      ...traceValide,
      steps: [{ node: 'search', durationMs: 340, summary: {}, calls: [{ kind: 'reseau', name: 'x', durationMs: 10 }] }],
    };
    expect(ExecutionTrace.safeParse(invalide).success).toBe(false);
  });
});
