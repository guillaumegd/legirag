import type { TexteComplementaire } from '@legirag/shared/schema';
import { formatDateFr, formatEtatBadge, formatMotifPresence } from '../lib/format';
import { ArticleExpander } from './article-expander';

export function RefItem({ texte, dateReference }: { texte: TexteComplementaire; dateReference: string }) {
  const badge = formatEtatBadge(texte.etat);

  return (
    <li className="ref-node">
      <div className="ref-item-title">
        <span>
          Article {texte.article_num} <span className="code-name">— {texte.code}</span>
        </span>
        <span className={`badge ${badge.className}`}>{badge.label}</span>
        <span className="ref-item-date">depuis le {formatDateFr(texte.date_debut)}</span>
      </div>
      <p className="ref-text">« {texte.texte_exact} »</p>
      <div className="ref-motif">
        <strong>Pourquoi ce texte :</strong> {formatMotifPresence(texte.motif_presence)}
      </div>
      <ArticleExpander articleIdentifier={texte.article_identifier} dateReference={dateReference} />
    </li>
  );
}
