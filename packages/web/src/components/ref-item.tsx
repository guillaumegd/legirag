import type { TexteComplementaire } from '@legirag/shared/schema';
import { formatMotifPresence } from '../lib/format';
import { ArticleExpander } from './article-expander';

export function RefItem({
  texte,
  isCrossCode,
  dateReference,
}: {
  texte: TexteComplementaire;
  isCrossCode: boolean;
  dateReference: string;
}) {
  return (
    <li className="ref-node">
      {isCrossCode ? (
        <svg
          className="ref-node-marker"
          width="19"
          height="19"
          viewBox="0 0 19 19"
          role="img"
          aria-label="Renvoi vers un autre code"
        >
          <circle cx="9.5" cy="9.5" r="8" fill="var(--surface)" stroke="var(--ref-cross-code)" strokeWidth="2" strokeDasharray="3 3" />
        </svg>
      ) : (
        <span
          className="ref-node-marker ref-node-marker-internal"
          role="img"
          aria-label="Renvoi dans le même code"
        />
      )}
      <div className="ref-item-title">
        Article {texte.article_num} <span className="code-name">— {texte.code}</span>
      </div>
      <p className="ref-text">« {texte.texte_exact} »</p>
      <div className="ref-motif">
        <strong>Pourquoi ce texte :</strong> {formatMotifPresence(texte.motif_presence)}
      </div>
      <ArticleExpander articleIdentifier={texte.article_identifier} dateReference={dateReference} />
    </li>
  );
}
