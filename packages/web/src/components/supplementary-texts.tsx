import type { ReponseStructuree } from '@legirag/shared/schema';
import { RefItem } from './ref-item';

export function SupplementaryTexts({ reponse }: { reponse: ReponseStructuree }) {
  if (reponse.textes_complementaires.length === 0) {
    return null;
  }

  const codeReglePrincipale = reponse.regle_principale?.code;

  return (
    <section className="answer-block">
      <h2>Textes complémentaires ({reponse.textes_complementaires.length})</h2>
      <div className="answer-body">
        <p className="ref-legend">Nœud plein = même code · anneau pointillé = autre code</p>
        <ul className="ref-rail">
          {reponse.textes_complementaires.map((texte) => (
            <RefItem
              key={`${texte.article_identifier}-${texte.subdivision}`}
              texte={texte}
              isCrossCode={codeReglePrincipale !== undefined && texte.code !== codeReglePrincipale}
              dateReference={reponse.date_reference}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
