import type { ReponseStructuree } from '@legirag/shared/schema';
import { RefItem } from './ref-item';

export function SupplementaryTexts({ reponse }: { reponse: ReponseStructuree }) {
  if (reponse.textes_complementaires.length === 0) {
    return null;
  }

  return (
    <section className="answer-block">
      <h2>Textes complémentaires ({reponse.textes_complementaires.length})</h2>
      <div className="answer-body">
        <ul className="ref-list">
          {reponse.textes_complementaires.map((texte) => (
            <RefItem
              key={`${texte.article_identifier}-${texte.subdivision}`}
              texte={texte}
              dateReference={reponse.date_reference}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
