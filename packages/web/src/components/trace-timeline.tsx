import type { ExecutionTrace } from '@legirag/shared/schema';
import { formatDurationMs } from '../lib/format';
import { describeStepNode, describeStepSummary } from '../lib/trace-step-summary';

const CALL_KIND_LABELS = { model: 'appel modèle', tool: 'appel outil' } as const;

export function TraceTimeline({ steps }: { steps: ExecutionTrace['steps'] }) {
  return (
    <ol className="trace">
      {steps.map((step, index) => (
        <li className="step" key={index}>
          <span className="step-dot" aria-hidden="true" />
          <div className="step-head">
            <span className="step-name">{describeStepNode(step.node)}</span>
            <span className="step-duration">{formatDurationMs(step.durationMs)}</span>
          </div>
          <div className="step-result">{describeStepSummary(step)}</div>
          {step.calls !== undefined && step.calls.length > 0 && (
            <ul className="step-calls">
              {step.calls.map((call, callIndex) => (
                <li key={callIndex}>
                  <span className="call-kind">{CALL_KIND_LABELS[call.kind]}</span>{' '}
                  <code className="call-name">{call.name}</code>{' '}
                  <span className="step-duration">{formatDurationMs(call.durationMs)}</span>
                  {call.tokenUsage !== undefined && (
                    <span className="call-tokens">
                      {' '}
                      · {call.tokenUsage.promptTokens + call.tokenUsage.completionTokens} tokens
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
