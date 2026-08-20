'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type HistoryEntry, listHistoryEntries } from '../../../lib/history';
import { HistoryEntryDetail } from '../../../components/history-entry-detail';

export default function HistoriqueEntryPage() {
  const params = useParams<{ id: string }>();
  const [entries, setEntries] = useState<HistoryEntry[] | undefined>(undefined);

  useEffect(() => {
    setEntries(listHistoryEntries());
  }, []);

  if (entries === undefined) {
    return null;
  }

  const entry = entries.find((candidate) => candidate.id === params.id);

  if (entry === undefined) {
    return (
      <main id="main" className="wrap">
        <a href="/historique" className="history-back">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12.5 5L7 10l5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Retour à l'historique</span>
        </a>
        <p role="alert" className="error-banner">
          Cette question n&rsquo;a pas été trouvée dans votre historique local.
        </p>
      </main>
    );
  }

  return (
    <main id="main" className="wrap">
      <HistoryEntryDetail entry={entry} />
    </main>
  );
}
