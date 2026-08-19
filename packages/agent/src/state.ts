import { Annotation } from '@langchain/langgraph';
import type { Citation, ReponseStructuree } from '@legirag/shared';

// Coût cumulé des appels generateObject de draft (item 9b) - undefined tant
// qu'aucune tentative n'a été faite (le nœud draft renvoie l'état inchangé
// dans son branchement "aucune citation", sans jamais initialiser à zéro).
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

// Forme sûre et sérialisable d'une erreur captée (item 19) - jamais la pile
// complète, seulement de quoi distinguer une panne de creds/throttling d'un
// échec de vérification côté modèle. Construite par serializeError (graph.ts)
// pour toute exception réellement attrapée ; le cas "index de citation
// invalide" côté draft n'en lève pas mais construit ce même shape à la main.
export interface ErrorInfo {
  name: string;
  message: string;
}

// Détail par appel individuel (item 12a) - accumulé sur tout le run comme
// citations/tokenUsage, pas juste le delta d'un nœud : route/search/draft/
// followRenvois sont des fermetures privées à buildFixedChainGraph,
// seulement observables via un graph.invoke(...) complet (voir
// graph.test.ts), donc l'état final doit porter la liste entière plutôt
// qu'un delta que rien ne pourrait relire après coup.
export interface AgentCall {
  kind: 'model' | 'tool';
  name: string;
  durationMs: number;
  tokenUsage?: TokenUsage;
  error?: ErrorInfo;
}

// Forme d'état durable du graphe LangGraph.js - pas encore un contrat
// cross-package : les champs peuvent bouger tant qu'ils restent internes à
// packages/agent. citations/renvoiIterations/newCitationsFound sont la
// mémoire de la boucle de suivi de renvois (8c) : citations grandit au fil
// des passes (search puis followRenvois), les deux autres bornent la boucle.
export const AgentStateAnnotation = Annotation.Root({
  question: Annotation<string>(),
  dateReference: Annotation<Date>(),
  codes: Annotation<string[] | undefined>(),
  traceId: Annotation<string>(),
  citations: Annotation<Citation[]>(),
  renvoiIterations: Annotation<number>(),
  newCitationsFound: Annotation<number>(),
  reponse: Annotation<ReponseStructuree | undefined>(),
  draftAttempts: Annotation<number>(),
  tokenUsage: Annotation<TokenUsage | undefined>(),
  calls: Annotation<AgentCall[]>(),
});

export type AgentState = typeof AgentStateAnnotation.State;
