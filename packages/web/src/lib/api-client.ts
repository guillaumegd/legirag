import type { Article, Subdivision } from '@legirag/shared/types';
import { createSseParser, type SseEvent } from './sse';

export interface AskQuestionInput {
  question: string;
  codes?: string[];
}

function apiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_API_URL n'est pas configurée.");
  }
  return url;
}

// Le flux est du text/event-stream, mais servi par un POST (le trace_id et
// le corps de la question sont dans la requête) - EventSource, qui ne gère
// que le GET, ne convient pas ; on lit donc le corps de la réponse via
// fetch() nous-mêmes.
export async function* askQuestion(input: AskQuestionInput, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  const response = await fetch(`${apiUrl()}/question`, {
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
    `${apiUrl()}/article/${encodeURIComponent(articleIdentifier)}?dateReference=${encodeURIComponent(dateReference)}`,
  );

  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`La lecture de l'article a échoué (${response.status}).`);
  }
  return (await response.json()) as ArticleWithSubdivisions;
}
