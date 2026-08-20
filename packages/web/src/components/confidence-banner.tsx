'use client';

import { useEffect, useState } from 'react';
import type { Confiance } from '@legirag/shared/schema';
import { formatConfidenceBanner, formatDateFr } from '../lib/format';

export function ConfidenceBanner({ confiance, dateReference }: { confiance: Confiance; dateReference: string }) {
  const meta = formatConfidenceBanner(confiance);
  const [gaugeReady, setGaugeReady] = useState(false);

  useEffect(() => {
    setGaugeReady(false);
    const timer = setTimeout(() => setGaugeReady(true), 60);
    return () => clearTimeout(timer);
  }, [confiance, dateReference]);

  return (
    <div className={`confidence-banner ${meta.className}`}>
      <div className="confidence-banner-head">
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 12.5A7 7 0 0117 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M10 12.5l3.5-4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="10" cy="12.5" r="1.1" fill="currentColor" />
        </svg>
        <span className="confidence-banner-label">{meta.label}</span>
        <span className="confidence-banner-date">Référence au {formatDateFr(dateReference)}</span>
      </div>
      <div className="confidence-gauge-track">
        <div className="confidence-gauge-fill" style={{ width: gaugeReady ? `${meta.gaugePercent}%` : '0%' }} />
      </div>
    </div>
  );
}
