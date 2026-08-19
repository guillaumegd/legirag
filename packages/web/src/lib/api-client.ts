import type { Article, Subdivision } from '@legirag/shared/types';
import type { ExecutionTrace } from '@legirag/shared/schema';
import { createSseParser, type SseEvent } from './sse';

export interface AskQuestionInput {
  question: string;
  codes?: string[];
}

// Le flux est du text/event-stream, mais servi par un POST (le trace_id et
// le corps de la question sont dans la requête) - EventSource, qui ne gère
// que le GET, ne convient pas ; on lit donc le corps de la réponse via
// fetch() nous-mêmes.
//
// Chemins relatifs vers les routes serveur Next.js (app/api/*, fix
// 2026-08-19) : le navigateur n'appelle plus jamais l'API directement, ces
// routes portent le token d'accès côté serveur.
export async function* askQuestion(input: AskQuestionInput, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  const response = await fetch('/api/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    ...(signal !== undefined && { signal }),
  });

  if (!response.ok || response.body === null) {
    throw new Error(`La question a échoué (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      yield event;
    }
  }
}

export interface ArticleWithSubdivisions {
  article: Article;
  subdivisions: Subdivision[];
}

// undefined = article introuvable ou non visible à cette date (404,
// GET /article/:articleIdentifier) - un état normal à afficher, pas une panne.
export async function fetchArticle(
  articleIdentifier: string,
  dateReference: string,
): Promise<ArticleWithSubdivisions | undefined> {
  const response = await fetch(
    `/api/article/${encodeURIComponent(articleIdentifier)}?dateReference=${encodeURIComponent(dateReference)}`,
  );

  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`La lecture de l'article a échoué (${response.status}).`);
  }
  return (await response.json()) as ArticleWithSubdivisions;
}

// undefined = trace introuvable (404) - un état normal à afficher (même
// convention que fetchArticle), pas une panne. Partagé par fetchTrace
// (ci-dessous, composants client) et fetchTraceServer (api-proxy.ts,
// Server Components) - vit ici plutôt que dans api-proxy.ts, qui importe
// next/headers (server-only) et casserait un composant client qui
// l'importerait transitivement.
export async function parseTraceResponse(response: Response): Promise<ExecutionTrace | undefined> {
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`La lecture de la trace a échoué (${response.status}).`);
  }
  return (await response.json()) as ExecutionTrace;
}

// GET /trace/:traceId, appelé par les composants client (chemin relatif).
export async function fetchTrace(traceId: string): Promise<ExecutionTrace | undefined> {
  return parseTraceResponse(await fetch(`/api/trace/${encodeURIComponent(traceId)}`));
}
