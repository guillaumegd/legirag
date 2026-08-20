'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExecutionTrace } from '@legirag/shared/schema';
import { fetchTrace } from '../lib/api-client';
import { formatDurationMs } from '../lib/format';
import { summarizeTrace } from '../lib/trace-summary';
import { ClockIcon } from './clock-icon';
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
      <div className="trace-totals-grid">
        <TraceStat icon={<ClockIcon size={16} />} label="Durée totale" value={formatDurationMs(trace.totalDurationMs)} />
        <TraceStat
          icon={
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="6" y="6" width="8" height="8" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 3v3M10 14v3M3 10h3M14 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          label="Appels modèle"
          value={summary.modelCalls}
        />
        <TraceStat
          icon={
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="2.3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8.2 8.2L15.5 15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M13 13l1.2-1.2a1.6 1.6 0 012.3 2.3L15.3 15.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          label="Appels outils"
          value={summary.toolCalls}
        />
        <TraceStat
          icon={
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M7 3v14M13 3v14M4 7.5h12M4 12.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          }
          label="Tokens utilisés"
          value={summary.totalTokens}
        />
      </div>
      <TraceTimeline steps={trace.steps} />
    </>
  );
}

function TraceStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="trace-stat-card">
      <span className="trace-stat-icon">{icon}</span>
      <div className="trace-stat-label">{label}</div>
      <div className="trace-stat-value">{value}</div>
    </div>
  );
}
