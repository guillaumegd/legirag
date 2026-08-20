import type { Citation } from '@legirag/shared/schema';
import { formatDateFr, formatEtatBadge } from '../lib/format';
import { ArticleExpander } from './article-expander';

// Doit rester identique à SUBDIVISION_ARTICLE_ENTIER (packages/agent/src/
// citation.ts, convention verrouillée en 8a) - non importable ici sans tirer
// packages/agent (LangGraph, Bedrock) dans le bundle navigateur.
const SUBDIVISION_ARTICLE_ENTIER = 'article entier';

export function CitationBlock({ citation, dateReference }: { citation: Citation; dateReference: string }) {
  const badge = formatEtatBadge(citation.etat);
  const codeName =
    citation.subdivision === SUBDIVISION_ARTICLE_ENTIER ? citation.code : `${citation.code}, ${citation.subdivision}`;

  return (
    <div className="citation">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="citation-icon">
        <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div>
        <blockquote>« {citation.texte_exact} »</blockquote>
        <div className="citation-meta">
          <strong>Article {citation.article_num}</strong>
          <span className="code-name">{codeName}</span>
          <span className={`badge ${badge.className}`}>{badge.label}</span>
          <span>depuis le {formatDateFr(citation.date_debut)}</span>
          <a href={citation.url_legifrance} target="_blank" rel="noopener noreferrer">
            Voir sur Légifrance ↗
          </a>
        </div>
        <ArticleExpander articleIdentifier={citation.article_identifier} dateReference={dateReference} />
      </div>
    </div>
  );
}
