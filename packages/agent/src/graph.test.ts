import { END } from '@langchain/langgraph';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import type { Chunk, Citation, ReponseStructuree, Renvoi, RequeteRecherche, Retriever } from '@legirag/shared';
import { fetchArticlesForCitation, type ArticleForCitation } from '@legirag/retrieval';
import type { AgentState } from './state.js';
import type { ReponseStructureeIndexee } from './schema.js';
import type { SplitRenvois } from './suivre-renvoi.js';
import {
  addUsage,
  afterDraft,
  afterFollowRenvois,
  buildFixedChainGraph,
  citationParIndex,
  citationsIndicesValides,
  renvoisNonCouverts,
  toReponseStructuree,
} from './graph.js';

// generateObject seul est mocké (le test 9c sur followRenvois a besoin d'un
// draft réussi sans appeler un vrai modèle) - NoObjectGeneratedError reste
// la vraie classe, graph.ts s'appuie sur isInstance().
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateObject: vi.fn() };
});

// fetchArticlesForCitation seul est mocké (search l'appelle en dur, pas
// injectable via buildFixedChainGraph) - évite un vrai appel DB dès qu'un
// test a besoin que search trouve des chunks (9c, followRenvois).
vi.mock('@legirag/retrieval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@legirag/retrieval')>();
  return { ...actual, fetchArticlesForCitation: vi.fn() };
});

afterEach(() => {
  vi.mocked(generateObject).mockReset();
  vi.mocked(fetchArticlesForCitation).mockReset();
});

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
  article_num: 'R413-1',
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
  draftAttempts: 0,
  tokenUsage: undefined,
  calls: [],
};

describe('addUsage', () => {
  it('additionne deux usages définis', () => {
    expect(addUsage({ promptTokens: 100, completionTokens: 20 }, { promptTokens: 50, completionTokens: 10 })).toEqual({
      promptTokens: 150,
      completionTokens: 30,
    });
  });

  it('traite undefined comme "rien à ajouter" côté a', () => {
    expect(addUsage(undefined, { promptTokens: 50, completionTokens: 10 })).toEqual({ promptTokens: 50, completionTokens: 10 });
  });

  it('traite undefined comme "rien à ajouter" côté b', () => {
    expect(addUsage({ promptTokens: 50, completionTokens: 10 }, undefined)).toEqual({ promptTokens: 50, completionTokens: 10 });
  });

  it('renvoie zéro quand les deux sont undefined', () => {
    expect(addUsage(undefined, undefined)).toEqual({ promptTokens: 0, completionTokens: 0 });
  });
});

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
  article_num: '131-13',
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

describe('buildFixedChainGraph - récupération après échec injecté (9c)', () => {
  it("search : un échec de retriever.search dégrade en abstention plutôt que de faire planter l'invoke", async () => {
    const retrieverCasse: Retriever = {
      async search() {
        throw new Error('connexion recherche indisponible');
      },
    };

    const graph = buildFixedChainGraph(retrieverCasse, modelNonAppele, routeurFactice);

    const result = await graph.invoke({
      question: 'question quelconque',
      dateReference: new Date('2026-08-17'),
      codes: undefined,
      traceId: 'trace-test-9c-search',
      reponse: undefined,
    });

    expect(result.citations).toEqual([]);
    expect(result.reponse?.confiance).toBe('abstention');
  });

  it('route : un échec de routeQuestion dégrade vers une recherche non filtrée plutôt que de faire planter l’invoke', async () => {
    const search = vi.fn<Retriever['search']>(async () => []);
    const routeurCasse = async (): Promise<never> => {
      throw new Error('routage indisponible');
    };

    const graph = buildFixedChainGraph({ search }, modelNonAppele, routeurCasse);

    const result = await graph.invoke({
      question: 'question quelconque',
      dateReference: new Date('2026-08-17'),
      codes: undefined,
      traceId: 'trace-test-9c-route',
      reponse: undefined,
    });

    expect(search).toHaveBeenCalledTimes(1);
    const requete = search.mock.calls[0]?.[0] as RequeteRecherche;
    expect(requete.codes).toBeUndefined();
    expect(result.reponse?.confiance).toBe('abstention');
  });

  it('followRenvois : un échec de suivreRenvoiFn conserve la réponse déjà construite par draft plutôt que de faire planter l’invoke', async () => {
    const articlePourCitation: ArticleForCitation = {
      articleIdentifier: CITATION_CONNUE.article_identifier,
      articleNum: '123',
      code: CITATION_CONNUE.code,
      etat: CITATION_CONNUE.etat,
      dateDebut: CITATION_CONNUE.date_debut,
      texteExact: CITATION_CONNUE.texte_exact,
    };
    vi.mocked(fetchArticlesForCitation).mockResolvedValueOnce([articlePourCitation]);

    const draftReussi: ReponseStructureeIndexee = {
      verdict: 'verdict de test',
      regle_principale_index: 0,
      textes_complementaires: [],
      hors_perimetre: ['hors périmètre'],
      confiance: 'elevee',
    };
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: draftReussi,
      usage: { promptTokens: 10, completionTokens: 5 },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const retrieverAvecResultat: Retriever = {
      async search(): Promise<Chunk[]> {
        return [{ id: 1, articleIdentifier: CITATION_CONNUE.article_identifier, contenu: 'texte' }];
      },
    };
    const suivreRenvoiCasse = async (): Promise<SplitRenvois> => {
      throw new Error('suivi de renvoi indisponible');
    };

    const graph = buildFixedChainGraph(retrieverAvecResultat, {} as LanguageModel, routeurFactice, suivreRenvoiCasse);

    const result = await graph.invoke({
      question: 'question quelconque',
      dateReference: new Date('2026-08-17'),
      codes: undefined,
      traceId: 'trace-test-9c-follow-renvois',
      reponse: undefined,
    });

    expect(result.reponse?.verdict).toBe('verdict de test');
    expect(result.reponse?.regle_principale?.article_identifier).toBe(CITATION_CONNUE.article_identifier);
    expect(result.renvoiIterations).toBe(1);
  });
});

const suivreRenvoiSansResultat = async (): Promise<SplitRenvois> => ({ renvois: [], nonResolus: [] });

describe('buildFixedChainGraph - traçage par appel individuel (12a)', () => {
  it('route : consigne son propre appel modèle avec son usage', async () => {
    const search = vi.fn<Retriever['search']>(async () => []);
    const routeurAvecUsage = async () => ({
      codes: ['code-de-la-route'],
      confiance: 0.9,
      raisonnement: 'test',
      usage: { promptTokens: 80, completionTokens: 20 },
    });

    const graph = buildFixedChainGraph({ search }, modelNonAppele, routeurAvecUsage);

    const result = await graph.invoke({
      question: 'question quelconque',
      dateReference: new Date('2026-08-17'),
      codes: undefined,
      traceId: 'trace-test-12a-route',
      reponse: undefined,
    });

    const routeCall = result.calls?.find((c) => c.name === 'routeQuestion');
    expect(routeCall).toMatchObject({ kind: 'model', tokenUsage: { promptTokens: 80, completionTokens: 20 } });

    // search : branche "aucun résultat" - un seul appel outil, sans fetchArticlesForCitation.
    const searchCalls = result.calls?.filter((c) => c.kind === 'tool');
    expect(searchCalls).toEqual([expect.objectContaining({ name: 'retriever.search' })]);
  });

  it('draft : consigne un appel par tentative, y compris la tentative dont l’index de citation est invalide', async () => {
    const articlePourCitation: ArticleForCitation = {
      articleIdentifier: CITATION_CONNUE.article_identifier,
      articleNum: '123',
      code: CITATION_CONNUE.code,
      etat: CITATION_CONNUE.etat,
      dateDebut: CITATION_CONNUE.date_debut,
      texteExact: CITATION_CONNUE.texte_exact,
    };
    vi.mocked(fetchArticlesForCitation).mockResolvedValueOnce([articlePourCitation]);

    const draftIndexInvalide: ReponseStructureeIndexee = {
      verdict: 'verdict de test',
      regle_principale_index: 99,
      textes_complementaires: [],
      hors_perimetre: ['hors périmètre'],
      confiance: 'elevee',
    };
    const draftValide: ReponseStructureeIndexee = {
      verdict: 'verdict de test',
      regle_principale_index: 0,
      textes_complementaires: [],
      hors_perimetre: ['hors périmètre'],
      confiance: 'elevee',
    };
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: draftIndexInvalide,
        usage: { promptTokens: 10, completionTokens: 5 },
      } as unknown as Awaited<ReturnType<typeof generateObject>>)
      .mockResolvedValueOnce({
        object: draftValide,
        usage: { promptTokens: 12, completionTokens: 8 },
      } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const retrieverAvecResultat: Retriever = {
      async search(): Promise<Chunk[]> {
        return [{ id: 1, articleIdentifier: CITATION_CONNUE.article_identifier, contenu: 'texte' }];
      },
    };

    const graph = buildFixedChainGraph(retrieverAvecResultat, {} as LanguageModel, routeurFactice, suivreRenvoiSansResultat);

    const result = await graph.invoke({
      question: 'question quelconque',
      dateReference: new Date('2026-08-17'),
      codes: undefined,
      traceId: 'trace-test-12a-draft',
      reponse: undefined,
    });

    const draftCalls = result.calls?.filter((c) => c.name.startsWith('generateObject'));
    expect(draftCalls).toHaveLength(2);
    expect(draftCalls?.[0]).toMatchObject({ kind: 'model', name: 'generateObject#1', tokenUsage: { promptTokens: 10, completionTokens: 5 } });
    expect(draftCalls?.[1]).toMatchObject({ kind: 'model', name: 'generateObject#2', tokenUsage: { promptTokens: 12, completionTokens: 8 } });
    expect(result.reponse?.confiance).toBe('elevee');

    // search (résultat non vide) et followRenvois (branche "rien de nouveau") ont chacun consigné leur(s) appel(s).
    const toolCallNames = result.calls?.filter((c) => c.kind === 'tool').map((c) => c.name);
    expect(toolCallNames).toEqual(['retriever.search', 'fetchArticlesForCitation', 'suivreRenvoiFn']);
  });

  it('followRenvois : consigne fetchArticlesForCitation en plus de suivreRenvoiFn quand de nouveaux renvois sont trouvés', async () => {
    const articlePourCitation: ArticleForCitation = {
      articleIdentifier: CITATION_CONNUE.article_identifier,
      articleNum: '123',
      code: CITATION_CONNUE.code,
      etat: CITATION_CONNUE.etat,
      dateDebut: CITATION_CONNUE.date_debut,
      texteExact: CITATION_CONNUE.texte_exact,
    };
    const articleNouveau: ArticleForCitation = {
      articleIdentifier: 'LEGIARTI-NOUVEAU',
      articleNum: '456',
      code: 'Code de la route',
      etat: 'VIGUEUR',
      dateDebut: '2020-01-01',
      texteExact: 'texte nouveau',
    };
    vi.mocked(fetchArticlesForCitation)
      .mockResolvedValueOnce([articlePourCitation])
      .mockResolvedValueOnce([articleNouveau]);

    const draftReussi: ReponseStructureeIndexee = {
      verdict: 'verdict de test',
      regle_principale_index: 0,
      textes_complementaires: [],
      hors_perimetre: ['hors périmètre'],
      confiance: 'elevee',
    };
    // mockResolvedValue (pas Once) : le redraft déclenché par newCitationsFound
    // > 0 rappelle draft une seconde fois (afterFollowRenvois), qui doit
    // retrouver un draft réussi plutôt qu'un mock non configuré.
    vi.mocked(generateObject).mockResolvedValue({
      object: draftReussi,
      usage: { promptTokens: 10, completionTokens: 5 },
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const retrieverAvecResultat: Retriever = {
      async search(): Promise<Chunk[]> {
        return [{ id: 1, articleIdentifier: CITATION_CONNUE.article_identifier, contenu: 'texte' }];
      },
    };
    const suivreRenvoiAvecNouveau = async (): Promise<SplitRenvois> => ({ renvois: [RENVOI_NOUVEAU], nonResolus: [] });

    const graph = buildFixedChainGraph(retrieverAvecResultat, {} as LanguageModel, routeurFactice, suivreRenvoiAvecNouveau);

    const result = await graph.invoke({
      question: 'question quelconque',
      dateReference: new Date('2026-08-17'),
      codes: undefined,
      traceId: 'trace-test-12a-follow-renvois',
      reponse: undefined,
    });

    // Passe 1 de followRenvois trouve LEGIARTI-NOUVEAU (nouveau) -> redraft ->
    // passe 2 de followRenvois retrouve le même renvoi, mais sa cible est
    // maintenant déjà connue -> renvoisNonCouverts l'écarte, pas de second
    // fetchArticlesForCitation depuis followRenvois.
    const toolCallNames = result.calls?.filter((c) => c.kind === 'tool').map((c) => c.name);
    expect(toolCallNames).toEqual([
      'retriever.search',
      'fetchArticlesForCitation',
      'suivreRenvoiFn',
      'fetchArticlesForCitation',
      'suivreRenvoiFn',
    ]);
    expect(result.renvoiIterations).toBe(2);
  });
});
