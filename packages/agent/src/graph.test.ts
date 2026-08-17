import { END } from '@langchain/langgraph';
import { describe, expect, it, vi } from 'vitest';
import type { LanguageModel } from 'ai';
import type { Chunk, Citation, ReponseStructuree, Renvoi, RequeteRecherche, Retriever } from '@legirag/shared';
import type { AgentState } from './state.js';
import type { ReponseStructureeIndexee } from './schema.js';
import {
  afterDraft,
  afterFollowRenvois,
  buildFixedChainGraph,
  citationParIndex,
  citationsIndicesValides,
  renvoisNonCouverts,
  toReponseStructuree,
} from './graph.js';

const emptyRetriever: Retriever = {
  async search(): Promise<Chunk[]> {
    return [];
  },
};

// Jamais appelé sur la branche testée ici - generateObject ne doit pas être
// atteint quand la recherche ne trouve rien.
const modelNonAppele = {} as LanguageModel;

// Routeur factice : le nœud route tourne avant draft, donc même les tests
// du seul nœud draft (branche abstention ci-dessous) en ont besoin - voir
// "Scope decision: why a third injectable dependency" (8b).
const routeurFactice = async () => ({ codes: [], confiance: 1, raisonnement: 'test' });

describe('buildFixedChainGraph - branche abstention (recherche vide)', () => {
  it('répond en abstention, sans appeler le modèle, quand la recherche ne trouve rien', async () => {
    const graph = buildFixedChainGraph(emptyRetriever, modelNonAppele, routeurFactice);

    const result = await graph.invoke({
      question: 'question totalement hors périmètre du corpus',
      dateReference: new Date('2026-08-17'),
      codes: undefined,
      traceId: 'trace-test-001',
      reponse: undefined,
    });

    expect(result.reponse?.confiance).toBe('abstention');
    expect(result.reponse?.regle_principale).toBeUndefined();
    expect(result.reponse?.escalade?.interlocuteur).toBe('support juridique legirag');
    expect(result.reponse?.trace_id).toBe('trace-test-001');
    expect(result.reponse?.hors_perimetre.length).toBeGreaterThan(0);
    expect(result.reponse?.date_reference).toBe('2026-08-17');
  });
});

describe('buildFixedChainGraph - routage (8b)', () => {
  it('transmet les codes choisis par le routeur à Retriever.search', async () => {
    const search = vi.fn<Retriever['search']>(async () => []);
    const routeurCodeDeLaRoute = async () => ({
      codes: ['code-de-la-route'],
      confiance: 0.9,
      raisonnement: 'test',
    });

    const graph = buildFixedChainGraph({ search }, modelNonAppele, routeurCodeDeLaRoute);

    await graph.invoke({
      question: 'vitesse maximale autorisée en agglomération',
      dateReference: new Date('2026-08-17'),
      codes: undefined,
      traceId: 'trace-test-002',
      reponse: undefined,
    });

    expect(search).toHaveBeenCalledTimes(1);
    const requete = search.mock.calls[0]?.[0] as RequeteRecherche;
    expect(requete.codes).toEqual(['code-de-la-route']);
  });
});

const CITATION_CONNUE: Citation = {
  article_identifier: 'LEGIARTI-CONNU',
  subdivision: 'article entier',
  code: 'Code de la route',
  texte_exact: 'texte connu',
  date_debut: '2020-01-01',
  etat: 'VIGUEUR',
  url_legifrance: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI-CONNU',
};

const RENVOI_DEJA_CONNU: Renvoi = {
  id: 1,
  sourceArticle: 'LEGIARTI-SOURCE',
  cibleArticleNum: '123',
  forme: 'simple',
  interCode: false,
  resolu: true,
  cibleArticleId: 'LEGIARTI-CONNU',
};

const RENVOI_NOUVEAU: Renvoi = {
  id: 2,
  sourceArticle: 'LEGIARTI-SOURCE',
  cibleArticleNum: '456',
  forme: 'simple',
  interCode: false,
  resolu: true,
  cibleArticleId: 'LEGIARTI-NOUVEAU',
};

const RENVOI_NON_RESOLU: Renvoi = {
  id: 3,
  sourceArticle: 'LEGIARTI-SOURCE',
  cibleArticleNum: '789',
  forme: 'simple',
  interCode: false,
  resolu: false,
};

describe('renvoisNonCouverts', () => {
  it('garde une cible résolue et pas encore citée', () => {
    expect(renvoisNonCouverts([RENVOI_NOUVEAU], [CITATION_CONNUE])).toEqual([RENVOI_NOUVEAU]);
  });

  it('écarte une cible déjà présente dans les citations', () => {
    expect(renvoisNonCouverts([RENVOI_DEJA_CONNU], [CITATION_CONNUE])).toEqual([]);
  });

  it('écarte un renvoi non résolu', () => {
    expect(renvoisNonCouverts([RENVOI_NON_RESOLU], [CITATION_CONNUE])).toEqual([]);
  });
});

const REPONSE_AVEC_REGLE: ReponseStructuree = {
  verdict: 'verdict',
  regle_principale: CITATION_CONNUE,
  textes_complementaires: [],
  hors_perimetre: ['hors périmètre'],
  confiance: 'elevee',
  date_reference: '2026-08-17',
  trace_id: 'trace-x',
};

const ETAT_BASE: AgentState = {
  question: 'question',
  dateReference: new Date('2026-08-17'),
  codes: undefined,
  traceId: 'trace-x',
  citations: [CITATION_CONNUE],
  renvoiIterations: 0,
  newCitationsFound: 0,
  reponse: undefined,
};

describe('afterDraft', () => {
  it('END quand la borne des itérations est atteinte', () => {
    expect(afterDraft({ ...ETAT_BASE, renvoiIterations: 2, reponse: REPONSE_AVEC_REGLE })).toBe(END);
  });

  it("END quand la réponse est une abstention (pas de regle_principale)", () => {
    expect(afterDraft({ ...ETAT_BASE, reponse: undefined })).toBe(END);
  });

  it('continue vers followRenvois sinon', () => {
    expect(afterDraft({ ...ETAT_BASE, renvoiIterations: 0, reponse: REPONSE_AVEC_REGLE })).toBe('followRenvois');
  });
});

describe('afterFollowRenvois', () => {
  it('retourne vers draft si de nouvelles citations ont été trouvées', () => {
    expect(afterFollowRenvois({ ...ETAT_BASE, newCitationsFound: 1 })).toBe('draft');
  });

  it("END si la passe n'a rien trouvé de nouveau", () => {
    expect(afterFollowRenvois({ ...ETAT_BASE, newCitationsFound: 0 })).toBe(END);
  });
});

const CITATION_DEUX: Citation = {
  article_identifier: 'LEGIARTI-DEUX',
  subdivision: 'I',
  code: 'Code pénal',
  texte_exact: 'texte deux',
  date_debut: '2021-06-01',
  etat: 'VIGUEUR',
  url_legifrance: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI-DEUX',
};

const CITATIONS_DEUX = [CITATION_CONNUE, CITATION_DEUX];

const DRAFT_VALIDE: ReponseStructureeIndexee = {
  verdict: 'verdict',
  regle_principale_index: 0,
  textes_complementaires: [{ index: 1, motif_presence: 'exception' }],
  hors_perimetre: ['hors périmètre'],
  confiance: 'elevee',
};

describe('citationsIndicesValides', () => {
  it('accepte un regle_principale_index dans les bornes', () => {
    expect(citationsIndicesValides(DRAFT_VALIDE, CITATIONS_DEUX.length)).toBe(true);
  });

  it('rejette un regle_principale_index hors bornes', () => {
    expect(citationsIndicesValides({ ...DRAFT_VALIDE, regle_principale_index: 5 }, CITATIONS_DEUX.length)).toBe(false);
  });

  it('rejette une réponse non abstentionniste sans regle_principale_index', () => {
    const { regle_principale_index: _omis, ...sansIndex } = DRAFT_VALIDE;
    expect(citationsIndicesValides(sansIndex, CITATIONS_DEUX.length)).toBe(false);
  });

  it('accepte une abstention sans regle_principale_index', () => {
    const { regle_principale_index: _omis, ...sansIndex } = DRAFT_VALIDE;
    expect(citationsIndicesValides({ ...sansIndex, confiance: 'abstention', textes_complementaires: [] }, CITATIONS_DEUX.length)).toBe(
      true,
    );
  });

  it('rejette un index de textes_complementaires hors bornes même si regle_principale_index est valide', () => {
    expect(
      citationsIndicesValides({ ...DRAFT_VALIDE, textes_complementaires: [{ index: 9, motif_presence: 'exception' }] }, CITATIONS_DEUX.length),
    ).toBe(false);
  });
});

describe('citationParIndex', () => {
  it('retourne la citation au bon index', () => {
    expect(citationParIndex(CITATIONS_DEUX, 1)).toBe(CITATION_DEUX);
  });

  it('lève une erreur sur un index hors bornes', () => {
    expect(() => citationParIndex(CITATIONS_DEUX, 9)).toThrow(/Index de citation invalide/);
  });
});

describe('toReponseStructuree', () => {
  it('substitue les vraies citations (tous les champs) aux index choisis par le modèle', () => {
    const reponse = toReponseStructuree(DRAFT_VALIDE, CITATIONS_DEUX, 'trace-x', new Date('2026-08-17'));

    expect(reponse.regle_principale).toEqual(CITATION_CONNUE);
    expect(reponse.textes_complementaires).toEqual([{ ...CITATION_DEUX, motif_presence: 'exception' }]);
    expect(reponse.date_reference).toBe('2026-08-17');
    expect(reponse.trace_id).toBe('trace-x');
  });
});
