import type { ReponseStructuree } from '@legirag/shared/schema';
import { formatConfianceBadge, formatDateFr } from '../lib/format';

export function FooterBar({ reponse }: { reponse: ReponseStructuree }) {
  const badge = formatConfianceBadge(reponse.confiance);
  return (
    <div className="footer-bar">
      <span>
        <span className={`badge ${badge.className}`}>{badge.label}</span> · référence au{' '}
        {formatDateFr(reponse.date_reference)}
      </span>
      <span>
        Trace <code>{reponse.trace_id}</code> ·{' '}
        <a href={`/trace/${encodeURIComponent(reponse.trace_id)}`}>voir la trace</a>
      </span>
    </div>
  );
}
