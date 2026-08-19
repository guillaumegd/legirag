import { END, START, StateGraph } from '@langchain/langgraph';
import { generateObject, NoObjectGeneratedError } from 'ai';
import type { LanguageModel } from 'ai';
import type { Citation, Renvoi, ReponseStructuree, Retriever } from '@legirag/shared';
import { ReponseStructuree as ReponseStructureeSchema, bedrockProvider } from '@legirag/shared';
import { SupabaseRetriever, fetchArticlesForCitation, formatDateReference } from '@legirag/retrieval';
import { SUBDIVISION_ARTICLE_ENTIER, toCitation } from './citation.js';
import { demanderALHumain } from './demander-a-l-humain.js';
import { routerQuestion } from './router-question.js';
import { ReponseStructureeIndexee, type RouterQuestionOutput } from './schema.js';
import { AgentStateAnnotation, type AgentCall, type AgentState, type ErrorInfo, type TokenUsage } from './state.js';
import { suivreRenvoi, type SplitRenvois } from './suivre-renvoi.js';

// Coût du routeur volontairement exclu (routerQuestion renvoie
// RouterQuestionOutput, un contrat verrouillé §5.3 - hors de question d'y
// ajouter usage) - voir "Scope decision" (9b). draft porte l'essentiel du
// coût (le prompt embarque les articles récupérés en entier), donc cette
// exclusion ne fausse pas significativement le total.
export function addUsage(a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage {
  const left = a ?? { promptTokens: 0, completionTokens: 0 };
  const right = b ?? { promptTokens: 0, completionTokens: 0 };
  return { promptTokens: left.promptTokens + right.promptTokens, completionTokens: left.completionTokens + right.completionTokens };
}

// Item 12a : ajoute un appel à la liste accumulée sur l'état (voir la note
// dans state.ts) - un seul point pour ce motif répété dans route/search/
// draft/followRenvois.
export function appendCall(existing: AgentCall[] | undefined, call: AgentCall): AgentCall[] {
  return [...(existing ?? []), call];
}

// usage optionnel : le contrat verrouillé RouterQuestionOutput (§5.3, 9b)
// reste inchangé (c'est le schéma que le modèle doit produire) - routerQuestion
// renvoie en plus son propre usage, à côté, uniquement pour que route puisse
// tracer son appel (12a). Toujours absent côté cap de coût (state.tokenUsage/
// MAX_DAILY_TOKENS) : cette exclusion-là reste celle décidée en 9b.
type RouteQuestion = (
  question: string,
  model?: LanguageModel,
  now?: Date,
) => Promise<RouterQuestionOutput & { usage?: TokenUsage }>;
type SuivreRenvoiFn = (articleId: string) => Promise<SplitRenvois>;

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

// Réduit une exception captée à un shape sûr et sérialisable (item 19) -
// jamais error.stack, seulement type/message, pour que la trace persistée
// reste diagnosticable sans jamais risquer d'y écrire une pile complète.
export function serializeError(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'UnknownError', message: String(error) };
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
  // Injecté pour la même raison que routeQuestion (8b) : followRenvois teste
  // sa propre dégradation sur échec (9c) sans dépendre d'une vraie panne DB.
  suivreRenvoiFn: SuivreRenvoiFn = suivreRenvoi,
) {
  // routeQuestion est injecté séparément de model : le nœud route tourne
  // avant draft et ne doit pas dépendre d'un LanguageModel qu'un test du
  // seul nœud draft (ex. la branche abstention) fournit volontairement
  // cassé - voir "Scope decision: why a third injectable dependency" (8b).
  async function route(state: AgentState): Promise<Partial<AgentState>> {
    const startedAtMs = Date.now();
    try {
      const { codes, usage } = await routeQuestion(state.question, model);
      const call: AgentCall = {
        kind: 'model',
        name: 'routeQuestion',
        durationMs: Date.now() - startedAtMs,
        ...(usage !== undefined ? { tokenUsage: usage } : {}),
      };
      return { codes, calls: appendCall(state.calls, call) };
    } catch (error) {
      // Le routage n'est qu'une aide de précision - search tourne déjà sans
      // filtre de code quand state.codes est undefined, donc un échec ici
      // dégrade vers une recherche non filtrée plutôt que de planter tout
      // le graphe (9c) ; si ça ne suffit pas non plus, le chemin "aucun
      // résultat" de search reprend la main.
      console.error('route : routeQuestion a échoué, recherche non filtrée par code.', error);
      const call: AgentCall = {
        kind: 'model',
        name: 'routeQuestion',
        durationMs: Date.now() - startedAtMs,
        error: serializeError(error),
      };
      return { codes: undefined, calls: appendCall(state.calls, call) };
    }
  }

  async function search(state: AgentState): Promise<Partial<AgentState>> {
    const startedAtMs = Date.now();
    try {
      const retrieverStartedAtMs = Date.now();
      const chunks = await retriever.search({
        texte: state.question,
        dateReference: state.dateReference,
        topK: TOP_K,
        ...(state.codes ? { codes: state.codes } : {}),
      });
      let calls = appendCall(state.calls, {
        kind: 'tool',
        name: 'retriever.search',
        durationMs: Date.now() - retrieverStartedAtMs,
      });

      if (chunks.length === 0) {
        return { citations: [], renvoiIterations: 0, calls };
      }

      const sources = chunks.map((chunk) => ({
        articleId: chunk.articleIdentifier,
        ...(chunk.subdivisionLabel !== undefined ? { subdivisionLabel: chunk.subdivisionLabel } : {}),
      }));
      const fetchStartedAtMs = Date.now();
      const citations = (await fetchArticlesForCitation(sources, state.dateReference)).map(toCitation);
      calls = appendCall(calls, { kind: 'tool', name: 'fetchArticlesForCitation', durationMs: Date.now() - fetchStartedAtMs });
      return { citations, renvoiIterations: 0, calls };
    } catch (error) {
      // Ni retriever.search ni fetchArticlesForCitation n'ont de repli
      // raisonnable (recherche/DB indisponible) - traité comme "rien
      // trouvé", la branche que draft transforme déjà en abstention honnête
      // plutôt que de laisser l'échec faire planter tout le graphe (9c).
      console.error('search : la recherche a échoué, traitée comme aucun résultat trouvé.', error);
      const call: AgentCall = {
        kind: 'tool',
        name: 'search',
        durationMs: Date.now() - startedAtMs,
        error: serializeError(error),
      };
      return { citations: [], renvoiIterations: 0, calls: appendCall(state.calls, call) };
    }
  }

  async function draft(state: AgentState): Promise<Partial<AgentState>> {
    const draftAttemptsSoFar = state.draftAttempts ?? 0;

    if (state.citations.length === 0) {
      return {
        reponse: buildAbstentionReponse(
          state.question,
          state.traceId,
          state.dateReference,
          'Aucun article trouvé dans le corpus indexé pour cette question.',
        ),
        draftAttempts: draftAttemptsSoFar,
        tokenUsage: state.tokenUsage,
        calls: state.calls,
      };
    }

    let draftAttempts = draftAttemptsSoFar;
    let tokenUsage = state.tokenUsage;
    let calls = state.calls;

    for (let attempt = 1; attempt <= MAX_DRAFT_ATTEMPTS; attempt++) {
      const startedAtMs = Date.now();
      try {
        const { object, usage } = await generateObject({
          model,
          schema: ReponseStructureeIndexee,
          prompt: buildDraftPrompt(state.question, state.citations),
        });
        draftAttempts++;
        tokenUsage = addUsage(tokenUsage, usage);
        const indexValide = citationsIndicesValides(object, state.citations.length);
        calls = appendCall(calls, {
          kind: 'model',
          name: `generateObject#${attempt}`,
          durationMs: Date.now() - startedAtMs,
          tokenUsage: usage,
          ...(indexValide
            ? {}
            : {
                error: {
                  name: 'IndexDeCitationInvalide',
                  message: `Index de citation hors bornes (pool de ${state.citations.length} citations).`,
                },
              }),
        });

        if (indexValide) {
          return {
            reponse: toReponseStructuree(object, state.citations, state.traceId, state.dateReference),
            draftAttempts,
            tokenUsage,
            calls,
          };
        }

        console.error(
          `draft : index de citation invalide (tentative ${attempt}/${MAX_DRAFT_ATTEMPTS}) pour la question "${state.question}".`,
        );
      } catch (error) {
        draftAttempts++;
        // NoObjectGeneratedError (forme invalide, ex. escalade manquante sur
        // une abstention - observé en direct pendant 8a) porte encore son
        // propre usage - le seul cas d'erreur où le coût réel de la
        // tentative ratée est récupérable plutôt que perdu (9b).
        let attemptUsage: TokenUsage | undefined;
        if (NoObjectGeneratedError.isInstance(error) && error.usage !== undefined) {
          tokenUsage = addUsage(tokenUsage, error.usage);
          attemptUsage = error.usage;
        }
        calls = appendCall(calls, {
          kind: 'model',
          name: `generateObject#${attempt}`,
          durationMs: Date.now() - startedAtMs,
          ...(attemptUsage !== undefined ? { tokenUsage: attemptUsage } : {}),
          error: serializeError(error),
        });
        // Un échec de generateObject lui-même doit être retenté comme un
        // index invalide, pas remonter et faire planter tout le run : la
        // vérification existe justement pour que le pire cas soit une
        // abstention honnête, jamais un crash.
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
      return { draftAttempts, tokenUsage, calls };
    }

    return {
      reponse: buildAbstentionReponse(
        state.question,
        state.traceId,
        state.dateReference,
        `La vérification des citations a échoué après ${MAX_DRAFT_ATTEMPTS} tentatives - aucune réponse fiable n'a pu être construite.`,
      ),
      draftAttempts,
      tokenUsage,
      calls,
    };
  }

  async function followRenvois(state: AgentState): Promise<Partial<AgentState>> {
    const sourceArticleId = state.reponse?.regle_principale?.article_identifier;
    const renvoiIterations = state.renvoiIterations + 1;
    if (sourceArticleId === undefined) {
      return { newCitationsFound: 0, renvoiIterations };
    }

    const startedAtMs = Date.now();
    try {
      const suivreStartedAtMs = Date.now();
      const { renvois } = await suivreRenvoiFn(sourceArticleId);
      let calls = appendCall(state.calls, {
        kind: 'tool',
        name: 'suivreRenvoiFn',
        durationMs: Date.now() - suivreStartedAtMs,
      });

      const nouveaux = renvoisNonCouverts(renvois, state.citations);
      if (nouveaux.length === 0) {
        return { newCitationsFound: 0, renvoiIterations, calls };
      }

      const sources = nouveaux.map((r) => ({
        articleId: r.cibleArticleId,
        ...(r.cibleSubdivision !== undefined ? { subdivisionLabel: r.cibleSubdivision } : {}),
      }));
      const fetchStartedAtMs = Date.now();
      const citationsNouvelles = (await fetchArticlesForCitation(sources, state.dateReference)).map(toCitation);
      calls = appendCall(calls, { kind: 'tool', name: 'fetchArticlesForCitation', durationMs: Date.now() - fetchStartedAtMs });

      return {
        citations: [...state.citations, ...citationsNouvelles],
        newCitationsFound: citationsNouvelles.length,
        renvoiIterations,
        calls,
      };
    } catch (error) {
      // draft a déjà produit une reponse valide à ce stade (afterDraft ne
      // route ici que si regle_principale existe) - un échec de suivi de
      // renvoi ne doit jamais l'écraser, seulement renoncer à l'enrichir
      // (9c), même traitement que "rien de nouveau trouvé" ci-dessus.
      console.error('followRenvois : suivreRenvoi a échoué, réponse existante conservée sans enrichissement.', error);
      const call: AgentCall = {
        kind: 'tool',
        name: 'followRenvois',
        durationMs: Date.now() - startedAtMs,
        error: serializeError(error),
      };
      return { newCitationsFound: 0, renvoiIterations, calls: appendCall(state.calls, call) };
    }
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
