'use client';

import { useRef, useState } from 'react';
import type { Article, Subdivision } from '@legirag/shared/types';
import { fetchArticle } from '../lib/api-client';

type ExpanderState =
  | { kind: 'collapsed' }
  | { kind: 'loading' }
  | { kind: 'loaded'; article: Article; subdivisions: Subdivision[] }
  | { kind: 'not-found' }
  | { kind: 'error' };

export function ArticleExpander({
  articleIdentifier,
  dateReference,
}: {
  articleIdentifier: string;
  dateReference: string;
}) {
  const [state, setState] = useState<ExpanderState>({ kind: 'collapsed' });
  // F-10 : jeton d'invocation - sans lui, une réponse de fetchArticle qui
  // arrive après que l'utilisateur a déjà replié (ou re-basculé) le volet
  // écrasait cet état plus récent en le rouvrant tout seul.
  const requestToken = useRef(0);

  async function toggle() {
    if (state.kind !== 'collapsed') {
      requestToken.current += 1;
      setState({ kind: 'collapsed' });
      return;
    }
    const token = (requestToken.current += 1);
    setState({ kind: 'loading' });
    try {
      const result = await fetchArticle(articleIdentifier, dateReference);
      if (requestToken.current !== token) {
        return;
      }
      setState(
        result === undefined
          ? { kind: 'not-found' }
          : { kind: 'loaded', article: result.article, subdivisions: result.subdivisions },
      );
    } catch {
      if (requestToken.current === token) {
        setState({ kind: 'error' });
      }
    }
  }

  const isOpen = state.kind !== 'collapsed';

  return (
    <div className="article-expander">
      <button
        type="button"
        className="article-expander-toggle"
        aria-expanded={isOpen}
        onClick={() => void toggle()}
      >
        {isOpen ? 'Masquer l’article entier' : 'Voir l’article entier'}
      </button>

      {state.kind === 'loading' && <p className="article-expander-status">Chargement…</p>}

      {state.kind === 'not-found' && (
        <p className="article-expander-status">Article introuvable ou non visible à cette date.</p>
      )}

      {state.kind === 'error' && (
        <p className="article-expander-status">La lecture de l'article a échoué.</p>
      )}

      {state.kind === 'loaded' && (
        <div className="article-full">
          <p className="article-full-text">{state.article.contenuMarkdown ?? state.article.contenuText}</p>
          {state.subdivisions.length > 0 && (
            <ul className="article-subdivisions">
              {[...state.subdivisions]
                .sort((a, b) => a.ordre - b.ordre)
                .map((subdivision) => (
                  <li key={subdivision.id}>
                    <strong>{subdivision.label}</strong>
                    {subdivision.contenu}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
