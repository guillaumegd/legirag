import type { ReponseStructuree } from '@legirag/shared/schema';
import { TracePanel } from './trace-panel';

export function FooterBar({ reponse }: { reponse: ReponseStructuree }) {
  return (
    <div className="footer-bar">
      <span className="footer-trace">
        Trace <code>{reponse.trace_id}</code>
      </span>
      <TracePanel traceId={reponse.trace_id} />
    </div>
  );
}
