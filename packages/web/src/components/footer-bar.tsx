import type { ReponseStructuree } from '@legirag/shared/schema';
import { formatConfianceBadge, formatDateFr } from '../lib/format';
import { TracePanel } from './trace-panel';

export function FooterBar({ reponse }: { reponse: ReponseStructuree }) {
  const badge = formatConfianceBadge(reponse.confiance);
  return (
    <div className="footer-bar">
      <span>
        <span className={`badge ${badge.className}`}>{badge.label}</span> · référence au{' '}
        {formatDateFr(reponse.date_reference)}
      </span>
      <span className="footer-trace">
        Trace <code>{reponse.trace_id}</code>
        <TracePanel traceId={reponse.trace_id} />
      </span>
    </div>
  );
}
