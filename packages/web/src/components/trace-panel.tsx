'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExecutionTrace } from '@legirag/shared/schema';
import { fetchTrace } from '../lib/api-client';
import { formatDurationMs } from '../lib/format';
import { summarizeTrace } from '../lib/trace-summary';
import { TraceTimeline } from './trace-timeline';
import '../app/trace/trace.css';

type PanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; trace: ExecutionTrace }
  | { kind: 'not-found' }
  | { kind: 'error' };

export function TracePanel({ traceId }: { traceId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Même garde-fou qu'ArticleExpander (F-10) : une réponse tardive de
  // fetchTrace ne doit pas écraser un état plus récent.
  const requestToken = useRef(0);

  function close() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function open() {
    setIsOpen(true);
    if (state.kind === 'idle') {
      void load();
    }
  }

  async function load() {
    const token = (requestToken.current += 1);
    setState({ kind: 'loading' });
    try {
      const trace = await fetchTrace(traceId);
      if (requestToken.current !== token) {
        return;
      }
      setState(trace === undefined ? { kind: 'not-found' } : { kind: 'loaded', trace });
    } catch {
      if (requestToken.current === token) {
        setState({ kind: 'error' });
      }
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button ref={triggerRef} type="button" className="trace-open-button" onClick={open}>
        Voir le raisonnement
      </button>

      <div
        className={`trace-scrim${isOpen ? ' open' : ''}`}
        aria-hidden={!isOpen}
        onClick={close}
      />
      <aside
        className={`trace-aside${isOpen ? ' open' : ''}`}
        aria-hidden={!isOpen}
        aria-label="Raisonnement de l'agent"
      >
        <div className="trace-aside-head">
          <div>
            <p className="trace-eyebrow">Raisonnement</p>
            <h2>
              Trace <code>{traceId}</code>
            </h2>
          </div>
          <button type="button" className="trace-close-button" aria-label="Fermer" onClick={close}>
            ×
          </button>
        </div>

        {state.kind === 'loading' && <p>Chargement…</p>}
        {state.kind === 'not-found' && <p>Trace introuvable.</p>}
        {state.kind === 'error' && <p>La lecture de la trace a échoué.</p>}

        {state.kind === 'loaded' && <LoadedTrace trace={state.trace} />}

        <a className="trace-full-link" href={`/trace/${encodeURIComponent(traceId)}`}>
          Ouvrir la page complète de la trace ↗
        </a>
      </aside>
    </>
  );
}

function LoadedTrace({ trace }: { trace: ExecutionTrace }) {
  const summary = summarizeTrace(trace);
  return (
    <>
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
      <TraceTimeline steps={trace.steps} />
    </>
  );
}
