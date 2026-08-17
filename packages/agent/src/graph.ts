import { END, START, StateGraph } from '@langchain/langgraph';
import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import type { Citation, Renvoi, ReponseStructuree, Retriever } from '@legirag/shared';
import { ReponseStructuree as ReponseStructureeSchema, bedrockProvider } from '@legirag/shared';
import { SupabaseRetriever, fetchArticlesForCitation, formatDateReference } from '@legirag/retrieval';
import { SUBDIVISION_ARTICLE_ENTIER, toCitation } from './citation.js';
import { demanderALHumain } from './demander-a-l-humain.js';
import { routerQuestion } from './router-question.js';
import { ReponseStructureeIndexee, type RouterQuestionOutput } from './schema.js';
import { AgentStateAnnotation, type AgentState } from './state.js';
import { suivreRenvoi } from './suivre-renvoi.js';

type RouteQuestion = (question: string, model?: LanguageModel, now?: Date) => Promise<RouterQuestionOutput>;

const TOP_K = 10;
// Bornée volontairement petite - suivre_renvoi ne fait qu'un saut par appel,
// cette constante borne combien de fois le graphe re-déclenche un saut et
// redessine, pas la profondeur d'un seul appel.
const MAX_RENVOI_ITERATIONS = 2;
// Le modèle pointe vers un numéro de source invalide de temps en temps -
// une nouvelle tentative suffit presque toujours ; au-delà, mieux vaut
// s'abstenir honnêtement que d'insister indéfiniment (8d).
const MAX_DRAFT_ATTEMPTS = 2;

function buildDraftPrompt(question: string, citations: Citation[]): string {
  const sources = citations
    .map((c, i) => {
      const reference = c.subdivision === SUBDIVISION_ARTICLE_ENTIER ? c.article_identifier : `${c.article_identifier}, ${c.subdivision}`;
      return `[${i}] ${c.code} - ${reference} (${c.etat}, en vigueur depuis ${c.date_debut})\n${c.texte_exact}`;
    })
    .join('\n\n');

  return [
    `Question : "${question}"`,
    '',
    'Sources récupérées par la recherche, numérotées :',
    sources,
    '',
    'Rédige une réponse avec exactement ces champs :',
    '- verdict : la réponse en une ou deux phrases.',
    "- regle_principale_index : le NUMÉRO entre crochets ci-dessus de la source qui fonde la réponse. Ne recopie jamais le contenu d'une source toi-même - indique uniquement son numéro.",
    "- textes_complementaires : tableau TOUJOURS présent (utilise [] si aucun ne s'applique), chaque entrée { index, motif_presence } (index = numéro de la source).",
    "- hors_perimetre : tableau TOUJOURS présent et jamais vide, ce que cette réponse ne couvre pas.",
    "- confiance : 'elevee', 'moyenne', ou 'abstention' si aucune source ci-dessus ne répond réellement à la question.",
    '',
    "Si confiance vaut 'abstention' : omets regle_principale_index et fournis obligatoirement escalade (motif, interlocuteur - par exemple 'support juridique legirag'). Sinon ('elevee' ou 'moyenne') : regle_principale_index est obligatoire et doit être un numéro de la liste ci-dessus, et omets escalade.",
  ].join('\n');
}

// La seule vérification code-niveau qui compte : chaque index renvoyé par
// le modèle doit réellement exister dans le pool fourni - le modèle n'a
// aucun autre moyen de "citer" un article que de pointer vers un numéro,
// donc un index hors bornes est la signature d'une citation non sourcée.
export function citationsIndicesValides(draft: ReponseStructureeIndexee, citationsCount: number): boolean {
  if (draft.confiance !== 'abstention' && (draft.regle_principale_index === undefined || draft.regle_principale_index >= citationsCount)) {
    return false;
  }
  return draft.textes_complementaires.every((t) => t.index < citationsCount);
}

// Défense en profondeur : citationsIndicesValides doit toujours avoir
// validé l'index avant cet appel - ce throw ne devrait jamais se déclencher.
export function citationParIndex(citations: Citation[], index: number): Citation {
  const citation = citations[index];
  if (citation === undefined) {
    throw new Error(`Index de citation invalide : ${index} (pool de ${citations.length} citations).`);
  }
  return citation;
}

// Substitue les vraies Citation récupérées par le code aux index choisis par
// le modèle - c'est cette étape, pas le prompt, qui garantit qu'aucun champ
// de citation dans la réponse finale n'a été inventé ou mal recopié par le
// modèle (voir le "<UNKNOWN>" observé en 8a).
export function toReponseStructuree(
  draft: ReponseStructureeIndexee,
  citations: Citation[],
  traceId: string,
  dateReference: Date,
): ReponseStructuree {
  return ReponseStructureeSchema.parse({
    verdict: draft.verdict,
    ...(draft.regle_principale_index !== undefined
      ? { regle_principale: citationParIndex(citations, draft.regle_principale_index) }
      : {}),
    textes_complementaires: draft.textes_complementaires.map((t) => ({
      ...citationParIndex(citations, t.index),
      motif_presence: t.motif_presence,
    })),
    hors_perimetre: draft.hors_perimetre,
    confiance: draft.confiance,
    ...(draft.escalade !== undefined ? { escalade: draft.escalade } : {}),
    date_reference: formatDateReference(dateReference),
    trace_id: traceId,
  });
}

// Ne garde que les renvois résolus dont la cible n'est pas déjà dans le pool
// de citations - un renvoi non résolu (cibleArticleId undefined) n'a rien à
// ajouter, et une cible déjà connue ne changerait rien à un redraft. Le type
// de retour porte la garantie cibleArticleId: string (via le prédicat de
// type ci-dessous) plutôt que de la laisser à une assertion `as string` côté
// appelant (followRenvois) - un futur changement de ce filtre casserait
// alors la compilation au lieu de réintroduire silencieusement un undefined.
export function renvoisNonCouverts(renvois: Renvoi[], citations: Citation[]): (Renvoi & { cibleArticleId: string })[] {
  const connus = new Set(citations.map((c) => c.article_identifier));
  return renvois.filter(
    (r): r is Renvoi & { cibleArticleId: string } => r.cibleArticleId !== undefined && !connus.has(r.cibleArticleId),
  );
}

// Continue vers followRenvois seulement si la borne n'est pas atteinte ET
// qu'il existe une regle_principale à partir de laquelle chercher des
// renvois (une abstention n'a rien à déplier).
export function afterDraft(state: AgentState): string {
  if (state.renvoiIterations >= MAX_RENVOI_ITERATIONS) return END;
  if (state.reponse?.regle_principale === undefined) return END;
  return 'followRenvois';
}

// Critère d'arrêt : une passe qui ne trouve rien de nouveau arrête la
// boucle plutôt que de redessiner pour rien.
export function afterFollowRenvois(state: AgentState): string {
  return state.newCitationsFound > 0 ? 'draft' : END;
}

function buildAbstentionReponse(question: string, traceId: string, dateReference: Date, motif: string): ReponseStructuree {
  // Réutilise demanderALHumain pour l'interlocuteur plutôt que de le
  // recopier en dur - motif reste distinct de questionOuverte (contrairement
  // au champ escalade combiné que renvoie demanderALHumain lui-même).
  const { interlocuteur } = demanderALHumain({ motif, questionOuverte: question });
  return {
    verdict: `Aucune source trouvée dans le corpus indexé pour répondre à : "${question}".`,
    textes_complementaires: [],
    hors_perimetre: [motif],
    confiance: 'abstention',
    escalade: { motif, interlocuteur },
    date_reference: formatDateReference(dateReference),
    trace_id: traceId,
  };
}

// Chaîne fixe (8a-8d) : routage -> recherche -> citations -> draft (avec
// vérification code-niveau des index de citation et retentative bornée),
// puis une boucle bornée de suivi de renvois qui redessine tant qu'elle
// trouve du nouveau. "Fixe" parce que l'orchestration elle-même (l'ordre des
// nœuds) ne change jamais d'une question à l'autre - la vérification et la
// boucle de renvois sont volontaires, pas de l'agentique au sens où item 9
// l'entendra ; cette base sert de comparaison pour l'écart mesuré par item 13.
export function buildFixedChainGraph(
  retriever: Retriever = new SupabaseRetriever(),
  model: LanguageModel = bedrockProvider.volume(),
  routeQuestion: RouteQuestion = routerQuestion,
) {
  // routeQuestion est injecté séparément de model : le nœud route tourne
  // avant draft et ne doit pas dépendre d'un LanguageModel qu'un test du
  // seul nœud draft (ex. la branche abstention) fournit volontairement
  // cassé - voir "Scope decision: why a third injectable dependency" (8b).
  async function route(state: AgentState): Promise<Partial<AgentState>> {
    const { codes } = await routeQuestion(state.question, model);
    return { codes };
  }

  async function search(state: AgentState): Promise<Partial<AgentState>> {
    const chunks = await retriever.search({
      texte: state.question,
      dateReference: state.dateReference,
      topK: TOP_K,
      ...(state.codes ? { codes: state.codes } : {}),
    });

    if (chunks.length === 0) {
      return { citations: [], renvoiIterations: 0 };
    }

    const sources = chunks.map((chunk) => ({
      articleId: chunk.articleIdentifier,
      ...(chunk.subdivisionLabel !== undefined ? { subdivisionLabel: chunk.subdivisionLabel } : {}),
    }));
    const citations = (await fetchArticlesForCitation(sources, state.dateReference)).map(toCitation);
    return { citations, renvoiIterations: 0 };
  }

  async function draft(state: AgentState): Promise<Partial<AgentState>> {
    if (state.citations.length === 0) {
      return {
        reponse: buildAbstentionReponse(
          state.question,
          state.traceId,
          state.dateReference,
          'Aucun article trouvé dans le corpus indexé pour cette question.',
        ),
      };
    }

    for (let attempt = 1; attempt <= MAX_DRAFT_ATTEMPTS; attempt++) {
      try {
        const { object } = await generateObject({
          model,
          schema: ReponseStructureeIndexee,
          prompt: buildDraftPrompt(state.question, state.citations),
        });

        if (citationsIndicesValides(object, state.citations.length)) {
          return { reponse: toReponseStructuree(object, state.citations, state.traceId, state.dateReference) };
        }

        console.error(
          `draft : index de citation invalide (tentative ${attempt}/${MAX_DRAFT_ATTEMPTS}) pour la question "${state.question}".`,
        );
      } catch (error) {
        // Un échec de generateObject lui-même (forme invalide, ex. escalade
        // manquante sur une abstention - observé en direct pendant 8a) doit
        // être retenté comme un index invalide, pas remonter et faire
        // planter tout le run : la vérification existe justement pour que
        // le pire cas soit une abstention honnête, jamais un crash.
        console.error(
          `draft : generateObject a échoué (tentative ${attempt}/${MAX_DRAFT_ATTEMPTS}) pour la question "${state.question}".`,
          error,
        );
      }
    }

    // Une repasse d'enrichissement (après followRenvois) qui échoue ne doit
    // jamais écraser une réponse déjà valide - seul le tout premier échec,
    // sans réponse antérieure, mérite une abstention.
    if (state.reponse !== undefined) {
      return {};
    }

    return {
      reponse: buildAbstentionReponse(
        state.question,
        state.traceId,
        state.dateReference,
        `La vérification des citations a échoué après ${MAX_DRAFT_ATTEMPTS} tentatives - aucune réponse fiable n'a pu être construite.`,
      ),
    };
  }

  async function followRenvois(state: AgentState): Promise<Partial<AgentState>> {
    const sourceArticleId = state.reponse?.regle_principale?.article_identifier;
    const renvoiIterations = state.renvoiIterations + 1;
    if (sourceArticleId === undefined) {
      return { newCitationsFound: 0, renvoiIterations };
    }

    const { renvois } = await suivreRenvoi(sourceArticleId);
    const nouveaux = renvoisNonCouverts(renvois, state.citations);
    if (nouveaux.length === 0) {
      return { newCitationsFound: 0, renvoiIterations };
    }

    const sources = nouveaux.map((r) => ({
      articleId: r.cibleArticleId,
      ...(r.cibleSubdivision !== undefined ? { subdivisionLabel: r.cibleSubdivision } : {}),
    }));
    const citationsNouvelles = (await fetchArticlesForCitation(sources, state.dateReference)).map(toCitation);

    return {
      citations: [...state.citations, ...citationsNouvelles],
      newCitationsFound: citationsNouvelles.length,
      renvoiIterations,
    };
  }

  return new StateGraph(AgentStateAnnotation)
    .addNode('route', route)
    .addNode('search', search)
    .addNode('draft', draft)
    .addNode('followRenvois', followRenvois)
    .addEdge(START, 'route')
    .addEdge('route', 'search')
    .addEdge('search', 'draft')
    .addConditionalEdges('draft', afterDraft)
    .addConditionalEdges('followRenvois', afterFollowRenvois)
    .compile();
}
