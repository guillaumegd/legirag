import type { ReponseStructuree } from '@legirag/shared/schema';
import { CitationBlock } from './citation-block';

export function MainRule({ reponse }: { reponse: ReponseStructuree }) {
  return (
    <section className="answer-block">
      <h2>Règle principale</h2>
      <div className="answer-body">
        <p className="verdict">{reponse.verdict}</p>
        {reponse.confiance === 'abstention' ? (
          <EscaladeNotice escalade={reponse.escalade} />
        ) : reponse.regle_principale !== undefined ? (
          <CitationBlock citation={reponse.regle_principale} dateReference={reponse.date_reference} />
        ) : null}
      </div>
    </section>
  );
}

function EscaladeNotice({ escalade }: { escalade: ReponseStructuree['escalade'] }) {
  if (escalade === undefined) {
    return null;
  }
  return (
    <div className="scope-panel">
      <h2>⚠ Abstention</h2>
      <p>{escalade.motif}</p>
      <p>
        <strong>À qui s'adresser :</strong> {escalade.interlocuteur}
      </p>
    </div>
  );
}
