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
    <li className="ref-item">
      <span className={`ref-tag ${isCrossCode ? 'cross' : 'internal'}`}>
        {isCrossCode ? 'Autre code' : 'Même code'}
      </span>
      <div className="ref-item-body">
        <div className="ref-item-title">
          Article {texte.article_num} <span className="code-name">— {texte.code}</span>
        </div>
        <p className="ref-text">« {texte.texte_exact} »</p>
        <div className="ref-motif">
          <strong>Pourquoi ce texte :</strong> {formatMotifPresence(texte.motif_presence)}
        </div>
        <ArticleExpander articleIdentifier={texte.article_identifier} dateReference={dateReference} />
      </div>
    </li>
  );
}
