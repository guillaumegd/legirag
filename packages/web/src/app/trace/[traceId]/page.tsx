import { notFound } from 'next/navigation';
import { fetchTrace } from '../../../lib/api-client';
import { summarizeTrace } from '../../../lib/trace-summary';
import { asConfiance, formatConfianceBadge, formatDurationMs } from '../../../lib/format';
import { TraceTimeline } from '../../../components/trace-timeline';
import '../trace.css';

interface TracePageProps {
  params: Promise<{ traceId: string }>;
}

export default async function TracePage({ params }: TracePageProps) {
  const { traceId } = await params;

  let trace;
  try {
    trace = await fetchTrace(traceId);
  } catch {
    return (
      <main id="main" className="wrap">
        <p role="alert" className="error-banner">
          La trace n&rsquo;a pas pu être chargée. Réessayez plus tard.
        </p>
      </main>
    );
  }

  if (trace === undefined) {
    notFound();
  }

  const summary = summarizeTrace(trace);
  const lastDraft = [...trace.steps].reverse().find((step) => step.node === 'draft');
  const confianceFinale = asConfiance(lastDraft?.summary.confiance);

  return (
    <main id="main" className="wrap trace-page">
      <p className="context-line">
        Trace <code>{trace.traceId}</code> pour <strong>« {trace.question} »</strong>
      </p>
      <h1>Trace de l&rsquo;agent</h1>

      <div className="totals">
        <span>
          Durée totale : <strong>{formatDurationMs(trace.totalDurationMs)}</strong>
        </span>
        <span>
          Appels modèle : <strong>{summary.modelCalls}</strong>
        </span>
        <span>
          Appels outils : <strong>{summary.toolCalls}</strong>
        </span>
        <span>
          Tokens utilisés : <strong>{summary.totalTokens}</strong>
        </span>
      </div>

      <div className="result-box">
        <h2>Résultat</h2>
        <p>
          Codes identifiés :{' '}
          <strong>{trace.codes !== undefined && trace.codes.length > 0 ? trace.codes.join(', ') : 'aucun'}</strong>
          {confianceFinale !== undefined && (
            <>
              {' '}
              · Confiance finale :{' '}
              <span className={`badge ${formatConfianceBadge(confianceFinale).className}`}>
                {formatConfianceBadge(confianceFinale).label}
              </span>
            </>
          )}
        </p>
      </div>

      <TraceTimeline steps={trace.steps} />
    </main>
  );
}
