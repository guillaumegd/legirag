import { Annotation } from '@langchain/langgraph';
import type { Citation, ReponseStructuree } from '@legirag/shared';

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
});

export type AgentState = typeof AgentStateAnnotation.State;
