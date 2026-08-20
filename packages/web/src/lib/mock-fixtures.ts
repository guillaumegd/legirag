import type { Article, Subdivision } from '@legirag/shared/types';
import type { Citation, ExecutionTrace, ReponseStructuree, TexteComplementaire } from '@legirag/shared/schema';
import { formatSseEvent } from './sse';
import type { MockScenario } from './mock-backend';

export const MOCK_TRACE_ID_NOMINAL = 'mock-trace-nominal';
export const MOCK_TRACE_ID_ABSTENTION = 'mock-trace-abstention';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Contenu volontairement crédible (vrais noms de code, numérotation réaliste,
// URLs Legifrance bien formées) plutôt que des placeholders type "mock 1" -
// le mode mock sert à juger le rendu de l'UI, un contenu ouvertement factice
// fausserait cette lecture.
const citationL1226_9: Citation = {
  article_identifier: 'mock-article-1',
  article_num: 'L1226-9',
  subdivision: 'alinéa 1',
  code: 'Code du travail',
  texte_exact:
    "Au cours des périodes de suspension du contrat de travail consécutives à un accident du travail ou une maladie professionnelle, l'employeur ne peut rompre ce contrat que s'il justifie soit d'une faute grave de l'intéressé, soit de son impossibilité de maintenir ce contrat pour un motif étranger à l'accident ou à la maladie.",
  date_debut: '2008-05-01',
  etat: 'VIGUEUR',
  url_legifrance: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006901120',
};

const texteL1226_13: TexteComplementaire = {
  article_identifier: 'mock-article-2',
  article_num: 'L1226-13',
  subdivision: 'alinéa unique',
  code: 'Code du travail',
  texte_exact:
    'Est nulle et de nul effet la résiliation du contrat de travail prononcée en méconnaissance des dispositions des articles L. 1226-9 et L. 1226-18.',
  date_debut: '2008-05-01',
  etat: 'VIGUEUR',
  url_legifrance: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006901127',
  motif_presence: 'renvoi_explicite',
};

const texteL1234_1: TexteComplementaire = {
  article_identifier: 'mock-article-3',
  article_num: 'L1234-1',
  subdivision: '3°',
  code: 'Code du travail',
  texte_exact:
    "Lorsque le licenciement est prononcé pour faute grave, le salarié n'a droit à aucun préavis ni, sous réserve de dispositions conventionnelles plus favorables, à aucune indemnité de licenciement.",
  date_debut: '2008-05-01',
  etat: 'VIGUEUR',
  url_legifrance: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006901174',
  motif_presence: 'condition',
};

function buildNominalReponse(traceId: string): ReponseStructuree {
  return {
    verdict:
      "Le salarié dont le contrat de travail est suspendu à la suite d'un accident du travail ne peut être licencié que pour faute grave ou pour impossibilité de maintenir le contrat pour un motif étranger à l'accident ; à défaut, le licenciement encourt la nullité.",
    regle_principale: citationL1226_9,
    textes_complementaires: [texteL1226_13, texteL1234_1],
    hors_perimetre: [
      "Le régime du licenciement pour inaptitude d'origine non professionnelle (articles L. 1226-2 et suivants) n'est pas traité par cette réponse.",
      "Le calcul du montant de l'indemnité de licenciement en cas de faute grave n'est pas couvert ici.",
    ],
    confiance: 'elevee',
    date_reference: today(),
    trace_id: traceId,
  };
}

function buildAbstentionReponse(traceId: string): ReponseStructuree {
  return {
    verdict: 'Aucune source trouvée dans le corpus indexé pour répondre à cette question.',
    textes_complementaires: [],
    hors_perimetre: [
      'Cette question porte sur un droit étranger, hors du périmètre de ce corpus (qui ne couvre que les codes français en vigueur).',
    ],
    confiance: 'abstention',
    escalade: {
      motif: 'Aucun article trouvé dans le corpus indexé pour cette question.',
      interlocuteur: 'Un avocat ou un juriste spécialisé dans le droit étranger concerné.',
    },
    date_reference: today(),
    trace_id: traceId,
  };
}

interface MockEvent {
  event: string;
  data: unknown;
  delayMs: number;
}

function eventsForScenario(scenario: MockScenario): MockEvent[] {
  switch (scenario) {
    case 'nominal':
      return [
        { event: 'route', data: { codes: ['code-du-travail'] }, delayMs: 350 },
        { event: 'search', data: { citations: [citationL1226_9, texteL1226_13, texteL1234_1] }, delayMs: 500 },
        { event: 'draft', data: {}, delayMs: 650 },
        { event: 'followRenvois', data: { newCitationsFound: 0 }, delayMs: 400 },
        { event: 'done', data: buildNominalReponse(MOCK_TRACE_ID_NOMINAL), delayMs: 0 },
      ];
    case 'abstention':
      return [
        { event: 'route', data: { codes: ['code-du-travail'] }, delayMs: 350 },
        { event: 'search', data: { citations: [] }, delayMs: 500 },
        { event: 'draft', data: {}, delayMs: 500 },
        { event: 'done', data: buildAbstentionReponse(MOCK_TRACE_ID_ABSTENTION), delayMs: 0 },
      ];
    case 'erreur':
      return [
        { event: 'route', data: { codes: ['code-du-travail'] }, delayMs: 350 },
        {
          event: 'error',
          data: { message: 'Une erreur interne est survenue pendant le traitement de la question.' },
          delayMs: 400,
        },
      ];
  }
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// Reproduit le flux réel (packages/api/src/question/stream-question.ts) :
// mêmes noms d'événement, même format SSE, un délai artificiel entre chaque
// événement pour que le journal d'activité de l'UI soit observable plutôt
// que de s'afficher d'un coup.
export function mockQuestionStream(scenario: MockScenario, question: string): ReadableStream<Uint8Array> {
  recordMockQuestion(scenario, question);
  const encoder = new TextEncoder();
  const events = eventsForScenario(scenario);
  return new ReadableStream({
    async start(controller) {
      for (const { event, data, delayMs } of events) {
        await sleep(delayMs);
        controller.enqueue(encoder.encode(formatSseEvent(event, data)));
      }
      controller.close();
    },
  });
}

function buildTrace(traceId: string, question: string, steps: ExecutionTrace['steps']): ExecutionTrace {
  const totalDurationMs = steps.reduce((sum, step) => sum + step.durationMs, 0);
  return {
    traceId,
    question,
    dateReference: today(),
    codes: ['code-du-travail'],
    steps,
    tokenUsage: { promptTokens: 1190, completionTokens: 254 },
    totalDurationMs,
    createdAt: new Date().toISOString(),
  };
}

// Le trace_id est fixe par scénario (pas par requête), donc GET /trace/:id
// n'a par lui-même aucun moyen de savoir quelle question a produit ce
// scénario - sans ça, la trace affichée ne correspondrait jamais à la
// question réellement posée (F-12). En mémoire seulement : suffisant pour un
// serveur dev local mono-processus, pas destiné à survivre un redémarrage.
const lastQuestionByTraceId = new Map<string, string>();

function traceIdForScenario(scenario: MockScenario): string | undefined {
  switch (scenario) {
    case 'nominal':
      return MOCK_TRACE_ID_NOMINAL;
    case 'abstention':
      return MOCK_TRACE_ID_ABSTENTION;
    case 'erreur':
      return undefined;
  }
}

function recordMockQuestion(scenario: MockScenario, question: string): void {
  const traceId = traceIdForScenario(scenario);
  if (traceId !== undefined && question.trim().length > 0) {
    lastQuestionByTraceId.set(traceId, question);
  }
}

const nominalTrace = buildTrace(
  MOCK_TRACE_ID_NOMINAL,
  "Un salarié en arrêt à la suite d'un accident du travail peut-il être licencié ?",
  [
    {
      node: 'route',
      durationMs: 340,
      summary: { codes: ['code-du-travail'] },
      calls: [{ kind: 'model', name: 'routeQuestion', durationMs: 340, tokenUsage: { promptTokens: 210, completionTokens: 14 } }],
    },
    {
      node: 'search',
      durationMs: 450,
      summary: { citationsCount: 3 },
      calls: [
        { kind: 'tool', name: 'retriever.search', durationMs: 260 },
        { kind: 'tool', name: 'fetchArticlesForCitation', durationMs: 190 },
      ],
    },
    {
      node: 'draft',
      durationMs: 640,
      summary: { confiance: 'elevee', attempts: 1 },
      calls: [{ kind: 'model', name: 'generateObject#1', durationMs: 640, tokenUsage: { promptTokens: 980, completionTokens: 240 } }],
    },
    {
      node: 'followRenvois',
      durationMs: 210,
      summary: { newCitationsFound: 0 },
      calls: [{ kind: 'tool', name: 'suivreRenvoi', durationMs: 210 }],
    },
  ],
);

const abstentionTrace = buildTrace(MOCK_TRACE_ID_ABSTENTION, 'Quelle est la durée du préavis de licenciement en droit du travail allemand ?', [
  {
    node: 'route',
    durationMs: 310,
    summary: { codes: ['code-du-travail'] },
    calls: [{ kind: 'model', name: 'routeQuestion', durationMs: 310, tokenUsage: { promptTokens: 195, completionTokens: 11 } }],
  },
  {
    node: 'search',
    durationMs: 220,
    summary: { citationsCount: 0 },
    calls: [{ kind: 'tool', name: 'retriever.search', durationMs: 220 }],
  },
  {
    node: 'draft',
    durationMs: 0,
    summary: { confiance: 'abstention', attempts: 0 },
  },
]);

export function mockTraceFor(traceId: string): ExecutionTrace | undefined {
  const trace =
    traceId === MOCK_TRACE_ID_NOMINAL ? nominalTrace : traceId === MOCK_TRACE_ID_ABSTENTION ? abstentionTrace : undefined;
  if (trace === undefined) {
    return undefined;
  }
  const recordedQuestion = lastQuestionByTraceId.get(traceId);
  return recordedQuestion !== undefined ? { ...trace, question: recordedQuestion } : trace;
}

// mock-article-1 et mock-article-2 partagent réellement cette section du
// Code du travail (L1226-9 et L1226-13 sont tous deux dans "Salarié victime
// d'un accident du travail...") - une seule constante plutôt que deux
// copies évite qu'une future mise à jour de fixture les fasse diverger
// silencieusement (F-13).
const accidentDuTravailSectionPath = [
  'Partie législative',
  'Livre II : Le contrat de travail',
  'Titre II : Formation et exécution du contrat de travail',
  "Chapitre VI : Résiliation du contrat de travail à durée indéterminée dans certaines situations particulières",
  "Section 1 : Salarié victime d'un accident du travail ou d'une maladie professionnelle",
];

const mockArticles: Record<string, { article: Article; subdivisions: Subdivision[] }> = {
  'mock-article-1': {
    article: {
      articleIdentifier: 'mock-article-1',
      articleNum: 'L1226-9',
      code: 'Code du travail',
      codeSlug: 'code-du-travail',
      etat: 'VIGUEUR',
      dateDebut: '2008-05-01',
      dateFin: '2999-01-01',
      sectionPath: accidentDuTravailSectionPath,
      contenuText: citationL1226_9.texte_exact,
      palier: 'largeur',
    },
    subdivisions: [],
  },
  'mock-article-2': {
    article: {
      articleIdentifier: 'mock-article-2',
      articleNum: 'L1226-13',
      code: 'Code du travail',
      codeSlug: 'code-du-travail',
      etat: 'VIGUEUR',
      dateDebut: '2008-05-01',
      dateFin: '2999-01-01',
      sectionPath: accidentDuTravailSectionPath,
      contenuText: texteL1226_13.texte_exact,
      palier: 'largeur',
    },
    subdivisions: [],
  },
  'mock-article-3': {
    article: {
      articleIdentifier: 'mock-article-3',
      articleNum: 'L1234-1',
      code: 'Code du travail',
      codeSlug: 'code-du-travail',
      etat: 'VIGUEUR',
      dateDebut: '2008-06-27',
      dateFin: '2999-01-01',
      sectionPath: [
        'Partie législative',
        'Livre II : Le contrat de travail',
        'Titre III : Rupture du contrat de travail à durée indéterminée',
        'Chapitre IV : Préavis et indemnités',
      ],
      contenuText:
        "Lorsque le licenciement n'est pas motivé par une faute grave, le salarié a droit :\n1° S'il justifie chez le même employeur d'une ancienneté de services continus inférieure à six mois, à un préavis dont la durée est déterminée par la loi, la convention ou l'accord collectif de travail, ou, à défaut, par les usages pratiqués dans la localité et la profession ;\n2° S'il justifie chez le même employeur d'une ancienneté de services continus comprise entre six mois et moins de deux ans, à un préavis d'un mois ;\n3° S'il justifie chez le même employeur d'une ancienneté de services continus d'au moins deux ans, à un préavis de deux mois.\nLorsque le licenciement est prononcé pour faute grave, le salarié n'a droit à aucun préavis ni, sous réserve de dispositions conventionnelles plus favorables, à aucune indemnité de licenciement.",
      palier: 'largeur',
    },
    subdivisions: [
      { id: 1, articleIdentifier: 'mock-article-3', label: '1°', ordre: 1, contenu: "S'il justifie chez le même employeur d'une ancienneté de services continus inférieure à six mois, à un préavis dont la durée est déterminée par la loi, la convention ou l'accord collectif de travail, ou, à défaut, par les usages pratiqués dans la localité et la profession." },
      { id: 2, articleIdentifier: 'mock-article-3', label: '2°', ordre: 2, contenu: "S'il justifie chez le même employeur d'une ancienneté de services continus comprise entre six mois et moins de deux ans, à un préavis d'un mois." },
      { id: 3, articleIdentifier: 'mock-article-3', label: '3°', ordre: 3, contenu: texteL1234_1.texte_exact },
    ],
  },
};

export function mockArticleFor(articleIdentifier: string): { article: Article; subdivisions: Subdivision[] } | undefined {
  return mockArticles[articleIdentifier];
}
